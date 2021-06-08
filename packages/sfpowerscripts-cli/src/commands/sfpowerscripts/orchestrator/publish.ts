import { flags } from '@salesforce/command';
import SfpowerscriptsCommand from '../../../SfpowerscriptsCommand';
import { Messages } from '@salesforce/core';
import * as fs from "fs-extra"
import path = require("path");
import ArtifactFilePathFetcher, {ArtifactFilePaths} from "@dxatscale/sfpowerscripts.core/lib/artifacts/ArtifactFilePathFetcher";
import PackageMetadata from "@dxatscale/sfpowerscripts.core/lib/PackageMetadata";
import child_process = require("child_process");
import SFPStatsSender from "@dxatscale/sfpowerscripts.core/lib/utils/SFPStatsSender";
import SFPLogger from "@dxatscale/sfpowerscripts.core/lib/utils/SFPLogger";

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@dxatscale/sfpowerscripts', 'publish');

export default class Promote extends SfpowerscriptsCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    `$ sfdx sfpowerscripts:orchestrator:publish -f path/to/script`,
    `$ sfdx sfpowerscripts:orchestrator:publish --npm`,
    `$ sfdx sfpowerscripts:orchestrator:publish -f path/to/script -p -v HubOrg`,
    `$ sfdx sfpowerscripts:orchestrator:publish -f path/to/script --gittag --pushgittag`
  ];

  protected static requiresUsername = false;
  protected static requiresDevhubUsername = false;

  protected static flagsConfig = {
    artifactdir: flags.directory({
      required: true,
      char: 'd',
      description: messages.getMessage('artifactDirectoryFlagDescription'),
      default: 'artifacts'
    }),
    publishpromotedonly: flags.boolean({
      char: 'p',
      description: messages.getMessage('publishPromotedOnlyFlagDescription'),
      dependsOn: ['devhubalias'],
    }),
    devhubalias: flags.string({
      char: 'v',
      description: messages.getMessage('devhubAliasFlagDescription'),
    }),
    scriptpath: flags.filepath({
      char: 'f',
      description: messages.getMessage('scriptPathFlagDescription')
    }),
    tag: flags.string({
      char: 't',
      description: messages.getMessage('tagFlagDescription')
    }),
    gittag: flags.boolean({
      description: messages.getMessage('gitTagFlagDescription'),
      default: false,
    }),
    pushgittag: flags.boolean({
      description: messages.getMessage('gitPushTagFlagDescription'),
      default: false,
    }),
    npm: flags.boolean({
      description: messages.getMessage('npmFlagDescription'),
      exclusive: ['scriptpath']
    }),
    scope: flags.string({
      description: messages.getMessage('scopeFlagDescription'),
      dependsOn: ['npm'],
      parse: (scope) => scope.replace(/@/g,"").toLowerCase()
    }),
    npmtag: flags.string({
      description: messages.getMessage('npmTagFlagDescription'),
      dependsOn: ['npm'],
      required: false
    }),
    npmrcpath: flags.filepath({
      description: messages.getMessage('npmrcPathFlagDescription'),
      dependsOn: ['npm'],
      required: false
    })
  };


  public async execute(){

    let nPublishedArtifacts: number = 0;
    let failedArtifacts: string[] = [];
    SFPLogger.isSupressLogs = true;

    let executionStartTime = Date.now();

    let succesfullyPublishedPackageNamesForTagging: {
      name: string,
      version: string,
      type: string,
      tag: string
    }[] = new Array();

    let npmrcFilesToCleanup: string[] = [];

    try {
    console.log("-----------sfpowerscripts orchestrator ------------------");
    console.log("command: publish");
    console.log(`target: ${this.flags.scriptpath ? this.flags.scriptpath : "NPM"}`);
    console.log(`Publish promoted artifacts only: ${this.flags.publishpromotedonly ? true : false}`);
    console.log("---------------------------------------------------------");

      let packageVersionList: any;
      if (this.flags.publishpromotedonly) {
        let packageVersionListJson: string = child_process.execSync(
          `sfdx force:package:version:list --released -v "${this.flags.devhubalias}" --json`,
          {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf8',
            maxBuffer: 5*1024*1024
          }
        );
        packageVersionList = JSON.parse(packageVersionListJson);
      }

      let artifacts = ArtifactFilePathFetcher.findArtifacts(this.flags.artifactdir);
      let artifactFilePaths = ArtifactFilePathFetcher.fetchArtifactFilePaths(this.flags.artifactdir);

      // Pattern captures two named groups, the "package" name and "version" number
      let pattern = new RegExp("(?<package>^.*)(?:_sfpowerscripts_artifact_)(?<version>.*)(?:\\.zip)");
      for (let artifact of artifacts) {
        let packageName: string;
        let packageVersionNumber: string;

        let match: RegExpMatchArray = path.basename(artifact).match(pattern);

        if (match !== null) {
          packageName = match.groups.package;
          packageVersionNumber = match.groups.version;
        } else {
          // artifact filename doesn't match pattern
          continue;
        }

        let {sourceDirectory, packageMetadata} = this.getPackageInfo(
          artifactFilePaths,
          packageName,
          packageVersionNumber
        );

        let packageType = packageMetadata.package_type;
        let packageVersionId = packageMetadata.package_version_id;

        if (this.flags.publishpromotedonly && packageType === "unlocked") {
          let isReleased = this.isPackageVersionIdReleased(packageVersionList, packageVersionId);

          if (!isReleased) {
            failedArtifacts.push(`${packageName} v${packageVersionNumber}`);
            console.log(`Skipping ${packageName} Version ${packageVersionNumber}. Package Version Id ${packageVersionId} has not been promoted.`);
            process.exitCode = 1;
            continue;
          }
        }

        try {
          if (this.flags.npm) {
            this.publishUsingNpm(
              sourceDirectory,
              packageName,
              packageVersionNumber,
              packageMetadata,
              npmrcFilesToCleanup
            );
          } else {
            this.publishUsingScript(
              packageName,
              packageVersionNumber,
              artifact
            );
          }

          succesfullyPublishedPackageNamesForTagging.push({
            name:packageName,
            version:packageVersionNumber.replace("-", "."),
            type: packageType,
            tag:`${packageName}_v${packageVersionNumber.replace("-", ".")}`
          });

          nPublishedArtifacts++;
        } catch (err) {
          failedArtifacts.push(`${packageName} v${packageVersionNumber}`);
          console.log(err.message);
          process.exitCode = 1;
        }
      }

      if (this.flags.gittag && failedArtifacts.length == 0) {
        this.createGitTags(succesfullyPublishedPackageNamesForTagging);
        this.pushGitTags();
      }


    } catch (err) {
      console.log(err.message);

      // Fail the task when an error occurs
      process.exitCode = 1;
    } finally {

      if (npmrcFilesToCleanup.length > 0) {
        npmrcFilesToCleanup.forEach((npmrcFile) => {
          fs.unlinkSync(npmrcFile);
        });
      }

      let totalElapsedTime: number = Date.now() - executionStartTime;

      console.log(
        `----------------------------------------------------------------------------------------------------`
      );
      console.log(
        `${nPublishedArtifacts} artifacts published in ${this.getFormattedTime(
          totalElapsedTime
        )} with {${failedArtifacts.length}} errors`
      );



      if (failedArtifacts.length > 0) {
        console.log(`Packages Failed to Publish`, failedArtifacts);
      }
      console.log(
        `----------------------------------------------------------------------------------------------------`
      );

      let tags = {
        publish_promoted_only: this.flags.publishpromotedonly ? "true" : "false"
      };

      if (this.flags.tag != null) {
        tags["tag"] = this.flags.tag;
      }

      SFPStatsSender.logGauge(
        "publish.duration",
        totalElapsedTime,
        tags
      );

      SFPStatsSender.logGauge(
        "publish.succeeded",
        nPublishedArtifacts,
        tags
      );

      if (failedArtifacts.length > 0) {
        SFPStatsSender.logGauge(
          "publish.failed",
          failedArtifacts.length,
          tags
        );
      }
    }
  }

  private publishUsingNpm(
    sourceDirectory: string,
    packageName: string,
    packageVersionNumber: string,
    packageMetadata: PackageMetadata,
    npmrcFilesToCleanup: string[]
  ) {
    let artifactRootDirectory = path.dirname(sourceDirectory);

    // NPM does not accept packages with uppercase characters
    let name: string = packageName.toLowerCase() + "_sfpowerscripts_artifact";

    if (this.flags.scope)
      name = `@${this.flags.scope}/` + name;

    let packageJson = {
      name: name,
      version: packageVersionNumber,
      repository: packageMetadata.repository_url
    };

    fs.writeFileSync(
      path.join(artifactRootDirectory, "package.json"),
      JSON.stringify(packageJson, null, 4)
    );

    if (this.flags.npmrcpath) {
      fs.copyFileSync(
        this.flags.npmrcpath,
        path.join(artifactRootDirectory, ".npmrc")
      );

      npmrcFilesToCleanup.push(
        path.join(artifactRootDirectory, ".npmrc")
      );
    }

    let cmd = `npm publish`;

    let tag: string;
    if (this.flags.npmtag) {
      tag = this.flags.npmtag;
    } else if (packageMetadata.branch) {
      tag = packageMetadata.branch
    } else {
      throw new Error(`Artifact ${packageName} ${packageVersionNumber} does not contain branch info. Please provide --npmtag flag explicitly, or re-build the artifact with the --branch flag.`);
    }

    cmd += ` --tag "${tag}"`;

    console.log(`Publishing ${packageName} Version ${packageVersionNumber} with tag ${tag}...`);

    child_process.execSync(
      cmd,
      {
        cwd: artifactRootDirectory,
        stdio: "pipe"
      }
    );
  }

  private publishUsingScript(
    packageName: string,
    packageVersionNumber: string,
    artifact: string
  ) {
    let cmd: string;
    if (process.platform !== 'win32') {
      cmd = `bash -e "${this.flags.scriptpath}" "${packageName}" ${packageVersionNumber} "${artifact}" ${this.flags.publishpromotedonly ? true : false}`;
    } else {
      cmd = `cmd.exe /c "${this.flags.scriptpath}" "${packageName}" ${packageVersionNumber} "${artifact}" ${this.flags.publishpromotedonly ? true : false}`;
    }

    console.log(`Publishing ${packageName} Version ${packageVersionNumber}...`);

    child_process.execSync(
      cmd,
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'inherit', 'inherit']
      }
    );
  }

  protected validateFlags() {
    if (this.flags.scriptpath === undefined && this.flags.npm === undefined)
      throw new Error("Either --scriptpath or --npm flag must be provided");

    if (this.flags.scriptpath && !fs.existsSync(this.flags.scriptpath))
      throw new Error(`Script path ${this.flags.scriptpath} does not exist`);

    if (this.flags.npm && !this.flags.scope)
      throw new Error("--scope parameter is required for NPM");
  }

  private pushGitTags() {
    console.log("Pushing Git Tags to Repo");
    if(this.flags.pushgittag)
    {
      child_process.execSync(
        `git push --tags`
      );
    }
  }

  private createGitTags(
    succesfullyPublishedPackageNamesForTagging: {
      name: string,
      version: string,
      type: string,
      tag: string
    }[]
  ) {
      console.log("Creating Git Tags in Repo");
      child_process.execSync(`git config --global user.email "sfpowerscripts@dxscale"`);
      child_process.execSync(`git config --global user.name "sfpowerscripts"`);

      for (let packageTag of succesfullyPublishedPackageNamesForTagging) {
        child_process.execSync(
          `git tag -a -m "${packageTag.name} ${packageTag.type} Package ${packageTag.version}" "${packageTag.tag}" HEAD`
        );
      }

  }

  private isPackageVersionIdReleased(packageVersionList: any, packageVersionId: string): boolean {
    let packageVersion = packageVersionList.result.find((pkg) => {
      return pkg.SubscriberPackageVersionId === packageVersionId;
    });

    if (packageVersion)
      return true
    else
      return false
  }

  /**
   * Get sourceDirectory and packageMetadata of artifact with package name and version
   * @param artifacts
   * @param packageName
   * @param packageVersionNumber
   */
  private getPackageInfo(
    artifacts: ArtifactFilePaths[],
    packageName,
    packageVersionNumber
  ): {sourceDirectory: string, packageMetadata: PackageMetadata }{
    for (let artifact of artifacts) {
      let packageMetadata: PackageMetadata = JSON.parse(fs.readFileSync(artifact.packageMetadataFilePath, 'utf8'));
      if (
        packageMetadata.package_name === packageName &&
        packageMetadata.package_version_number === packageVersionNumber.replace("-", ".")
      ) {
        return { sourceDirectory: artifact.sourceDirectoryPath, packageMetadata: packageMetadata };
      }
    }

    throw new Error(`Unable to find artifact metadata for ${packageName} Version ${packageVersionNumber.replace("-", ".")}`);
  }

  private getFormattedTime(milliseconds: number): string {
    let date = new Date(0);
    date.setSeconds(milliseconds / 1000); // specify value for SECONDS here
    let timeString = date.toISOString().substr(11, 8);
    return timeString;
  }
}

import child_process = require("child_process");
import * as fs from "fs-extra";
import path = require("path");
import Git from "@dxatscale/sfpowerscripts.core/lib/utils/Git";
import GitTags from "@dxatscale/sfpowerscripts.core/lib/utils/GitTags";
import ReleaseDefinitionSchema from "../release/ReleaseDefinitionSchema";
import FetchArtifactsError from "../../errors/FetchArtifactsError";
import * as rimraf from "rimraf";

export default class FetchImpl {
  constructor(
    private releaseDefinition: ReleaseDefinitionSchema,
    private artifactDirectory: string,
    private scriptPath: string,
    private isNpm: boolean,
    private scope: string,
    private npmrcPath: string
  ){}

  async exec(): Promise<{
    success: [string, string][],
    failed: [string, string][]
  }> {




    //Create Artifact Directory
    rimraf.sync("artifacts");
    fs.mkdirpSync("artifacts");

    let fetchedArtifacts: {
      success: [string, string][],
      failed: [string, string][]
    };
    if (this.isNpm) {

      fetchedArtifacts = await this.fetchArtifactsFromNpm(
        this.releaseDefinition,
        this.artifactDirectory,
        this.scope,
        this.npmrcPath
      );

    } else {
      fetchedArtifacts = await this.fetchArtifactsFromScript(
        this.releaseDefinition,
        this.artifactDirectory
      );
    }

    return fetchedArtifacts;
  }

  private async fetchArtifactsFromNpm(
    releaseDefinition: ReleaseDefinitionSchema,
    artifactDirectory: string,
    scope: string,
    npmrcPath: string
  ): Promise<{
    success: [string, string][],
    failed: [string, string][]
  }> {
    if (npmrcPath) {
      fs.copyFileSync(
        npmrcPath,
        path.resolve(".npmrc")
      );

      if (!fs.existsSync("package.json")) {
        // package json is required in the same directory as .npmrc
        fs.writeFileSync("package.json", "{}");
      }

    }
    const git: Git = new Git(null);

    let fetchedArtifacts = {
      success: [],
      failed: []
    };

    let artifacts: [string, string][];
    let i: number;
    try {
      artifacts = Object.entries(releaseDefinition.artifacts);
      for (i = 0; i < artifacts.length; i++) {
        let version: string;
        if (artifacts[i][1] === "LATEST_TAG" ||artifacts[i][1] === "LATEST_GIT_TAG"  ) {
          version = await this.getVersionFromLatestTag(git, artifacts[i][0]);
        } else
          version = artifacts[i][1];

        // NPM package names must be lowercase
        let packageName = artifacts[i][0].toLowerCase();
        let cmd = `npm pack "@${scope}/${packageName}_sfpowerscripts_artifact@${version}"`

        console.log(`Fetching artifact for ${artifacts[i][0]} version ${version}`);
        child_process.execSync(
          cmd,
          {
            cwd: artifactDirectory,
            stdio: "pipe",
          }
        );

        fetchedArtifacts.success.push(artifacts[i]);
      }
    } catch (error) {
      console.log(error.message);
      fetchedArtifacts.failed = artifacts.slice(i);
      throw new FetchArtifactsError("Failed to fetch artifacts", fetchedArtifacts, error);
    }


    return fetchedArtifacts;
  }

  private async fetchArtifactsFromScript(
    releaseDefinition: ReleaseDefinitionSchema,
    artifactDirectory: string
  ): Promise<{
    success: [string, string][],
    failed: [string, string][]
  }> {
    const git: Git = new Git(null);

    let fetchedArtifacts = {
      success: [],
      failed: []
    };

    let artifacts: [string, string][];
    let i: number;
    try {
      artifacts = Object.entries(releaseDefinition.artifacts);
      for (i = 0; i < artifacts.length; i++) {
        let version: string;
        if (artifacts[i][1] === "LATEST_TAG"||artifacts[i][1] === "LATEST_GIT_TAG") {
          version = await this.getVersionFromLatestTag(git, artifacts[i][0]);
        } else
          version = artifacts[i][1];

        let cmd: string;
        if (process.platform !== 'win32') {
          cmd = `bash -e "${this.scriptPath}" "${artifacts[i][0]}" "${version}" "${artifactDirectory}"`;
        } else {
          cmd = `cmd.exe /c "${this.scriptPath}" "${artifacts[i][0]}" "${version}" "${artifactDirectory}"`;
        }

        console.log(`Fetching artifact for ${artifacts[i][0]} version ${version}`);
        child_process.execSync(
          cmd,
          {
            cwd: process.cwd(),
            stdio: ['ignore', 'inherit', 'inherit']
          }
        );

        fetchedArtifacts.success.push(artifacts[i]);
      }
    } catch (error) {
      console.log(error.message);
      fetchedArtifacts.failed = artifacts.slice(i);
      throw new FetchArtifactsError("Failed to fetch artifacts", fetchedArtifacts, error);
    }

    return fetchedArtifacts;
  }

  private async getVersionFromLatestTag(
    git: Git,
    packageName: string
  ): Promise<string> {
    let version: string;

    let gitTags = new GitTags(git, packageName);
    let tags = await gitTags.listTagsOnBranch();
    let latestTag = tags.pop();

    if (latestTag) {
      let match: RegExpMatchArray = latestTag.match(
        /^.*_v(?<version>[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+|\.LATEST|\.NEXT)?)$/
      );
      if (match)
        version = this.substituteBuildNumberWithPreRelease(
          match.groups.version
        );
      else
       throw new Error(`Failed to find valid tag for ${packageName}`);

    } else throw new Error(`Failed to find latest tag for ${packageName}`);

    return version;
  }

  private substituteBuildNumberWithPreRelease(
    packageVersionNumber: string
  ) {
    let segments = packageVersionNumber.split(".");

    if (segments.length === 4) {
      packageVersionNumber = segments.reduce(
        (version, segment, segmentsIdx) => {
          if (segmentsIdx === 3) return version + "-" + segment;
          else return version + "." + segment;
        }
      );
    }

    return packageVersionNumber;
  }
}

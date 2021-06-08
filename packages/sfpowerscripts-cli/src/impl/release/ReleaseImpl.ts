import ReleaseDefinitionSchema from "./ReleaseDefinitionSchema";
import FetchImpl from "../artifacts/FetchImpl";
import DeployImpl, { DeployProps , DeploymentMode, DeploymentResult } from "../deploy/DeployImpl";
import SFPLogger, { LoggerLevel } from "@dxatscale/sfpowerscripts.core/lib/utils/SFPLogger";
import { Stage } from "../Stage";
import child_process = require("child_process");
import ReleaseError from "../../errors/ReleaseError";
import ChangelogImpl from "../../impl/changelog/ChangelogImpl";



export interface ReleaseProps
{
  releaseDefinition: ReleaseDefinitionSchema,
  targetOrg: string,
  fetchArtifactScript: string,
  isNpm: boolean,
  scope: string,
  npmrcPath: string,
  logsGroupSymbol: string[],
  tags: any,
  isDryRun: boolean,
  waitTime: number,
  keys: string,
  isGenerateChangelog: boolean,
  devhubUserName: string,
  branch:string
}


export default class ReleaseImpl {

  constructor(
    private props: ReleaseProps
  ){}

  public async exec(): Promise<ReleaseResult> {

    this.printOpenLoggingGroup("Fetching artifacts");
    let fetchImpl: FetchImpl = new FetchImpl(
      this.props.releaseDefinition,
      "artifacts",
      this.props.fetchArtifactScript,
      this.props.isNpm,
      this.props.scope,
      this.props.npmrcPath
    );
    await fetchImpl.exec();
    this.printClosingLoggingGroup();


    let installDependenciesResult: InstallDependenciesResult;
    if (this.props.releaseDefinition.packageDependencies) {
      installDependenciesResult = this.installPackageDependencies(
        this.props.releaseDefinition.packageDependencies,
        this.props.targetOrg,
        this.props.keys,
        this.props.waitTime
      );
    }

    let deploymentResult = await this.deployArtifacts(this.props.releaseDefinition);

    if (deploymentResult.failed.length > 0 || deploymentResult.error) {
      throw new ReleaseError(
        "Deployment failed",
        {deploymentResult: deploymentResult, installDependenciesResult: installDependenciesResult}
      );
    } else {
      if (this.props.isGenerateChangelog) {
        this.printOpenLoggingGroup("Release changelog");

        let changelogImpl: ChangelogImpl = new ChangelogImpl(
          "artifacts",
          this.props.releaseDefinition.release,
          this.props.releaseDefinition.changelog.workItemFilter,
          this.props.releaseDefinition.changelog.limit,
          this.props.releaseDefinition.changelog.workItemUrl,
          this.props.releaseDefinition.changelog.showAllArtifacts,
          false,
          this.props.branch,
          this.props.targetOrg
        );

        await changelogImpl.exec();


        this.printClosingLoggingGroup();
      }

      return {
        deploymentResult: deploymentResult,
        installDependenciesResult: installDependenciesResult
      }
    }
  }


  private async deployArtifacts(
    releaseDefinition: ReleaseDefinitionSchema
  ) {

    let deployProps: DeployProps = {
      targetUsername: this.props.targetOrg,
      artifactDir: "artifacts",
      waitTime: this.props.waitTime,
      tags: this.props.tags,
      isTestsToBeTriggered: false,
      deploymentMode: DeploymentMode.NORMAL,
      skipIfPackageInstalled: releaseDefinition.skipIfAlreadyInstalled,
      logsGroupSymbol: this.props.logsGroupSymbol,
      currentStage: Stage.DEPLOY,
      baselineOrg: releaseDefinition.baselineOrg,
      isDryRun: this.props.isDryRun,
      promotePackagesBeforeDeploymentToOrg: releaseDefinition.promotePackagesBeforeDeploymentToOrg,
      devhubUserName: this.props.devhubUserName
    };

    let deployImpl: DeployImpl = new DeployImpl(
      deployProps
    );

    let deploymentResult = await deployImpl.exec();

    return deploymentResult;
  }

  private installPackageDependencies(
    packageDependencies: {[p:string]: string},
    targetOrg: string,
    keys: string,
    waitTime: number
  ): InstallDependenciesResult {
    let result: InstallDependenciesResult = {
      success: [],
      skipped: [],
      failed: []
    };

    this.printOpenLoggingGroup("Installing package dependencies");

    try {
      let packagesToKeys: {[p: string]: string};
      if (keys) {
        packagesToKeys = this.parseKeys(keys);
      }

      // print packages dependencies to install

      for (let pkg in packageDependencies) {
        if (!this.isPackageInstalledInOrg(packageDependencies[pkg], targetOrg)) {
          let cmd = `sfdx force:package:install -p "${packageDependencies[pkg]}" -u "${targetOrg}" -w ${waitTime} -b ${waitTime} --noprompt`;

          if (packagesToKeys?.[pkg])
            cmd += ` -k ${packagesToKeys[pkg]}`;

          SFPLogger.log(
            `Installing package dependency ${pkg}: ${packageDependencies[pkg]}`,
            null,
            null,
            LoggerLevel.INFO
          );
          child_process.execSync(
            cmd,
            {
              stdio: 'inherit'
            }
          );
          result.success.push([pkg, packageDependencies[pkg]]);
        } else {
          result.skipped.push([pkg, packageDependencies[pkg]]);
          console.log(`Package dependency ${pkg}: ${packageDependencies[pkg]} is already installed in target org`);
          continue;
        }
      }

      this.printClosingLoggingGroup();
      return result;
    } catch (err) {
      console.log(err.message);

      throw new ReleaseError(
        "Failed to install package dependencies",
        {installDependenciesResult: result, deploymentResult: null},
        err
      );
    }
  }

  /**
   * Parse keys in string format "packageA:key packageB:key packageC:key"
   * Returns map of packages to keys
   * @param keys
   */
  private parseKeys(
    keys: string
  ) {
    let output: {[p: string]: string} = {};

    keys = keys.trim();
    let listOfKeys = keys.split(" ");

    for (let key of listOfKeys) {
      let packageKeyPair = key.split(":");
      if (packageKeyPair.length === 2) {
        output[packageKeyPair[0]] = packageKeyPair[1];
      } else {
        // Format is incorrect, throw an error
        throw new Error(
          `Error parsing keys, format should be: "packageA:key packageB:key packageC:key"`
        );
      }
    }

    return output;
  }

  private isPackageInstalledInOrg(packageVersionId: string, targetUsername: string): boolean {
    try {
      SFPLogger.log(`Checking Whether Package with ID ${packageVersionId} is installed in  ${targetUsername}`);
      let command = `sfdx sfpowerkit:package:version:info  -u "${targetUsername}" --json`;
      let result = JSON.parse(child_process.execSync(command).toString());
      if (result.status === 0) {
        let packageInfos: PackageInfo[] = result.result;
        let packageFound = packageInfos.find((packageInfo) => {
          return packageInfo.packageVersionId === packageVersionId
        });
        return packageFound ? true : false;
      } else throw new Error("Unable to query packages installed in org");
    } catch (error) {
      SFPLogger.log(
        "Unable to check whether this package is installed in the target org");
      return false;
    }
  }

  private printOpenLoggingGroup(message:string) {
    if (this.props.logsGroupSymbol?.[0])
      SFPLogger.log(
        this.props.logsGroupSymbol[0],
        `${message}`,
        null,
        LoggerLevel.INFO
      );
  }

  private printClosingLoggingGroup() {
    if (this.props.logsGroupSymbol?.[1])
      SFPLogger.log(
        this.props.logsGroupSymbol[1],
        null,
        null,
        LoggerLevel.INFO
      );
  }
}

type PackageInfo = {
  packageName: string;
  subcriberPackageId: string;
  packageNamespacePrefix: string;
  packageVersionId: string;
  packageVersionNumber: string;
  allowedLicenses: number;
  usedLicenses: number;
  expirationDate: string;
  status: string;
}

interface InstallDependenciesResult {
  success: [string, string][],
  skipped: [string, string][],
  failed: [string, string][]
}

export interface ReleaseResult {
  deploymentResult: DeploymentResult,
  installDependenciesResult: InstallDependenciesResult
}

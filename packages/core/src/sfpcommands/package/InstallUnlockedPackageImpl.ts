import child_process = require("child_process");
import { onExit } from "../../utils/OnExit";
import PackageMetadata from "../../PackageMetadata";
import { PackageInstallationResult, PackageInstallationStatus } from "../../package/PackageInstallationResult";
import SFPLogger from "../../utils/SFPLogger";
import PackageInstallationHelpers from "../../utils/PackageInstallationHelpers";
import path = require("path");
import fs = require("fs");
import PackageMetadataPrinter from "../../display/PackageMetadataPrinter";
import SFPStatsSender from "../../utils/SFPStatsSender";
import ArtifactInstallationStatusUpdater from "../../artifacts/ArtifactInstallationStatusUpdater";

export default class InstallUnlockedPackageImpl {
  public constructor(
    private package_version_id: string,
    private targetusername: string,
    private options: any,
    private wait_time: string,
    private publish_wait_time: string,
    private skip_if_package_installed: boolean,
    private packageMetadata:PackageMetadata,
    private sourceDirectory?:string,
    private packageLogger?:any
  ) {}

  public async exec(): Promise<PackageInstallationResult> {
    try {
      let startTime = Date.now();
      let isPackageInstalled = false;
      if (this.skip_if_package_installed) {
        isPackageInstalled = this.checkWhetherPackageIsIntalledInOrg();
      }

      if (!isPackageInstalled) {
        if (this.sourceDirectory) {
          let preDeploymentScript: string = path.join(
            this.sourceDirectory,
            `scripts`,
            `preDeployment`
          );

          if (fs.existsSync(preDeploymentScript)) {
            console.log("Executing preDeployment script");
            PackageInstallationHelpers.executeScript(
              preDeploymentScript,
              this.packageMetadata.package_name,
              this.targetusername
            );
          }

          if (this.packageMetadata.assignPermSetsPreDeployment) {
            SFPLogger.log(
              "Assigning permission sets before deployment:",
              null,
              this.packageLogger
            );

            PackageInstallationHelpers.applyPermsets(
              this.packageMetadata.assignPermSetsPreDeployment,
              this.targetusername,
              this.sourceDirectory
            );
          }

        }

            //Print Metadata carried in the package
         PackageMetadataPrinter.printMetadataToDeploy(this.packageMetadata?.payload);

        let command = this.buildPackageInstallCommand();
        let child = child_process.exec(command);

        child.stderr.on("data", (data) => {
          SFPLogger.log(data.toString(),null,this.packageLogger);
        });

        child.stdout.on("data", (data) => {
          SFPLogger.log(data.toString(),null,this.packageLogger);
        });


        await onExit(child);


        if(this.sourceDirectory) {
          let postDeploymentScript: string = path.join(
            this.sourceDirectory,
            `scripts`,
            `postDeployment`
          );

          if (fs.existsSync(postDeploymentScript)) {
            console.log("Executing postDeployment script");
            PackageInstallationHelpers.executeScript(
              postDeploymentScript,
              this.packageMetadata.package_name,
              this.targetusername
            );
          }

          if (this.packageMetadata.assignPermSetsPostDeployment) {
            SFPLogger.log(
              "Assigning permission sets after deployment:",
              null,
              this.packageLogger
            );

            PackageInstallationHelpers.applyPermsets(
              this.packageMetadata.assignPermSetsPostDeployment,
              this.targetusername,
              this.sourceDirectory
            )
          }
        }


        await ArtifactInstallationStatusUpdater.updatePackageInstalledInOrg(
          this.targetusername,
          this.packageMetadata,
          false
        );


        let elapsedTime = Date.now() - startTime;
        SFPStatsSender.logElapsedTime(
          "package.installation.elapsed_time",
          elapsedTime,
          {
            package: this.packageMetadata.package_name,
            type: "unlocked",
            target_org: this.targetusername,
          }
        );
        SFPStatsSender.logCount("package.installation", {
          package: this.packageMetadata.package_name,
          type: "unlocked",
          target_org: this.targetusername,
        });

        return { result: PackageInstallationStatus.Succeeded}
      } else {
        SFPLogger.log("Skipping Package Installation",null,this.packageLogger)
        return { result: PackageInstallationStatus.Skipped }
      }
    } catch (err) {

      SFPStatsSender.logCount("package.installation.failure", {
        package: this.packageMetadata.package_name,
        type: "unlocked",
        target_org: this.targetusername,
      });

      return {
        result: PackageInstallationStatus.Failed,
        message: err.message
      }
    }
  }


  private buildPackageInstallCommand(): string {
    let command = `sfdx force:package:install --package ${this.package_version_id} -u "${this.targetusername}" --noprompt`;

    command += ` --publishwait=${this.publish_wait_time}`;
    command += ` --wait=${this.wait_time}`;
    command += ` --securitytype=${this.options["securitytype"]}`;
    command += ` --upgradetype=${this.options["upgradetype"]}`;
    command += ` --apexcompile=${this.options["apexcompile"]}`;

    if (this.options["installationkey"])
      command += ` --installationkey=${this.options["installationkey"]}`;

    SFPLogger.log(`Generated Command ${command}`,null,this.packageLogger);
    return command;
  }

  private checkWhetherPackageIsIntalledInOrg(): boolean {
    try {
      SFPLogger.log(`Checking Whether Package with ID ${this.package_version_id} is installed in  ${this.targetusername}`,null,this.packageLogger);
      let command = `sfdx sfpowerkit:package:version:info  -u "${this.targetusername}" --json`;
      let result = JSON.parse(child_process.execSync(command).toString());
      if (result.status == 0) {
        let packageInfos: PackageInfo[] = result.result;
        let packageFound = packageInfos.find((packageInfo) => {
          if(packageInfo.packageVersionId == this.package_version_id)
          return true;
        });
        if (packageFound) {
          SFPLogger.log(
            "Package To be installed was found in the target org",
            packageFound,
            this.packageLogger
          );
          return true;
        }
      }
    } catch (error) {
      SFPLogger.log(
        "Unable to check whether this package is installed in the target org",null,this.packageLogger
      );
      return false;
    }
  }
}



type PackageInfo= {
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

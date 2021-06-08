import PackageMetadata from "../../PackageMetadata";
import child_process = require("child_process");
import { onExit } from "../../utils/OnExit";
import fs = require("fs");
import ArtifactInstallationStatusChecker from "../../artifacts/ArtifactInstallationStatusChecker";
import { PackageInstallationResult, PackageInstallationStatus } from "../../package/PackageInstallationResult";
import ProjectConfig from "../../project/ProjectConfig";
import SFPLogger from "../../utils/SFPLogger";
import PackageInstallationHelpers from "../../utils/PackageInstallationHelpers";
import ArtifactInstallationStatusUpdater from "../../artifacts/ArtifactInstallationStatusUpdater";
import SFPStatsSender from "../../utils/SFPStatsSender";
const path = require("path");

export default class InstallDataPackageImpl {
  public constructor(
    private sfdx_package: string,
    private targetusername: string,
    private sourceDirectory: string,
    private packageMetadata: PackageMetadata,
    private skip_if_package_installed: boolean,
    private isPackageCheckHandledByCaller?:boolean,
    private packageLogger?:any
  ) {}

  public async exec(): Promise<PackageInstallationResult> {

    let packageDirectory: string;

    try {
      let startTime = Date.now();
      let packageDescriptor = ProjectConfig.getSFDXPackageDescriptor(this.sourceDirectory, this.sfdx_package);

      if (packageDescriptor.aliasfy) {
        packageDirectory = path.join(
          packageDescriptor["path"],
          this.targetusername
        );
      } else {
        packageDirectory = path.join(
          packageDescriptor["path"]
        )
      }

      let absPackageDirectory: string = path.join(this.sourceDirectory, packageDirectory);
      if (!fs.existsSync(absPackageDirectory)) {
        throw new Error(`Source directory ${absPackageDirectory} does not exist`)
      }


      let isPackageInstalled = false;
      if (this.skip_if_package_installed) {
        let installationStatus = await ArtifactInstallationStatusChecker.checkWhetherPackageIsIntalledInOrg(
          this.targetusername,
          this.packageMetadata,
          this.isPackageCheckHandledByCaller
        );
        isPackageInstalled = installationStatus.isInstalled;

        if(isPackageInstalled)
          {
           SFPLogger.log("Skipping Package Installation",null,this.packageLogger)
           return { result: PackageInstallationStatus.Skipped }
          }
      }

      let preDeploymentScript: string = path.join(
        this.sourceDirectory,
        `scripts`,
        `preDeployment`
      );

      if (fs.existsSync(preDeploymentScript)) {
        console.log("Executing preDeployment script");
        PackageInstallationHelpers.executeScript(
          preDeploymentScript,
          this.sfdx_package,
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


      let command = this.buildExecCommand(packageDirectory);
      let child = child_process.exec(
        command,
        { cwd: path.resolve(this.sourceDirectory), encoding: "utf8" }
      );

      child.stdout.on("data", (data) => {
        SFPLogger.log(data.toString(),null,this.packageLogger);
      });

      child.stderr.on("data", (data) => {
        SFPLogger.log(data.toString(),null,this.packageLogger);
      });

      await onExit(child);

      let postDeploymentScript: string = path.join(
        this.sourceDirectory,
        `scripts`,
        `postDeployment`
      );

      if (fs.existsSync(postDeploymentScript)) {
        console.log("Executing postDeployment script");
        PackageInstallationHelpers.executeScript(
          postDeploymentScript,
          this.sfdx_package,
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
        );
      }

      await ArtifactInstallationStatusUpdater.updatePackageInstalledInOrg(
        this.targetusername,
        this.packageMetadata,
        this.isPackageCheckHandledByCaller
      );

      let elapsedTime = Date.now() - startTime;
        SFPStatsSender.logElapsedTime(
          "package.installation.elapsed_time",
          elapsedTime,
          {
            package: this.packageMetadata.package_name,
            type: "data",
            target_org: this.targetusername,
          }
        );
        SFPStatsSender.logCount("package.installation", {
          package: this.packageMetadata.package_name,
          type: "data",
          target_org: this.targetusername,
        });

      return {result: PackageInstallationStatus.Succeeded};


    } catch (err) {
      SFPStatsSender.logCount("package.installation.failure", {
        package: this.packageMetadata.package_name,
        type: "data",
        target_org: this.targetusername,
      });
      return {result: PackageInstallationStatus.Failed, message: err.message};
    } finally {
      let csvIssuesReportFilepath: string = path.join(this.sourceDirectory, packageDirectory, `CSVIssuesReport.csv`)
      if (fs.existsSync(csvIssuesReportFilepath)) {
        SFPLogger.log(`\n---------------------WARNING: SFDMU detected CSV issues, verify the following files -------------------------------`,null,this.packageLogger);
        SFPLogger.log(fs.readFileSync(csvIssuesReportFilepath, 'utf8'),null,this.packageLogger);
      }
    }
  }

  private buildExecCommand(packageDirectory:string): string {
    let command = `sfdx sfdmu:run --path "${packageDirectory}" -s csvfile -u "${this.targetusername}" --noprompt`;

    SFPLogger.log(`Generated Command ${command}`,null,this.packageLogger);
    return command;
  }
}

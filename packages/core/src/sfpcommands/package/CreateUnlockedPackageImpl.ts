import child_process = require("child_process");
import { onExit } from "../../utils/OnExit";
import PackageMetadata from "../../PackageMetadata";
import SourcePackageGenerator from "../../generators/SourcePackageGenerator";
import ProjectConfig from "../../project/ProjectConfig";
import SFPLogger from "../../utils/SFPLogger";
import * as fs from "fs-extra";
import { EOL } from "os";
import { delay } from "../../utils/Delay";
import PackageVersionListImpl from "../../sfdxwrappers/PackageVersionListImpl";
import SFPStatsSender from "../../utils/SFPStatsSender";
import SFPPackage  from "../../package/SFPPackage";
const path = require("path");

export default class CreateUnlockedPackageImpl {
  private packageLogger;
  private static packageTypeInfos: any[];
  private isOrgDependentPackage: boolean = false;

  public constructor(
    private sfdx_package: string,
    private version_number: string,
    private config_file_path: string,
    private installationkeybypass: boolean,
    private installationkey: string,
    private project_directory: string,
    private devhub_alias: string,
    private wait_time: string,
    private isCoverageEnabled: boolean,
    private isSkipValidation: boolean,
    private packageArtifactMetadata: PackageMetadata,
    private pathToReplacementForceIgnore?: string
  ) {
    fs.outputFileSync(
      `.sfpowerscripts/logs/${sfdx_package}`,
      `sfpowerscripts--log${EOL}`
    );
    this.packageLogger = `.sfpowerscripts/logs/${sfdx_package}`;
  }

  public async exec(): Promise<PackageMetadata> {
    this.packageArtifactMetadata.package_type = "unlocked";

    let startTime = Date.now();

    let projectManifest = ProjectConfig.getSFDXPackageManifest(
      this.project_directory
    );


    let sfppackage:SFPPackage = await SFPPackage.buildPackageFromProjectConfig(
      this.project_directory,
      this.sfdx_package,
      this.config_file_path,
      this.packageLogger,
      this.pathToReplacementForceIgnore
    );
    let packageDirectory: string =sfppackage.packageDescriptor.path;
     //Get the revised package Descriptor
     let packageDescriptor = sfppackage.packageDescriptor;
     let packageId = ProjectConfig.getPackageId(
       projectManifest,
       this.sfdx_package
     );


    // Get working directory
    let workingDirectory = sfppackage.workingDirectory;

    //Get the one in working directory
    this.config_file_path = path.join("config", "project-scratch-def.json");




    SFPLogger.log("Package Directory", packageDirectory, this.packageLogger);

    //Get Type of Package
    SFPLogger.log(
      "Fetching Package Type Info from DevHub",
      null,
      this.packageLogger
    );
    let packageTypeInfos = await this.getPackageTypeInfos();
    let packageTypeInfo = packageTypeInfos.find(
      (pkg) => pkg.Id == packageId
    );

    if(packageTypeInfo==null)
    {
      SFPLogger.log("Unable to find a package info for this particular package, Are you sure you created this package?");
    }


    if (packageTypeInfo?.IsOrgDependent == "Yes")
      this.isOrgDependentPackage = true;

    SFPLogger.log("-------------------------", null, this.packageLogger);
    SFPLogger.log("Package", packageTypeInfo.Name, this.packageLogger);
    SFPLogger.log(
      "IsOrgDependent",
      packageTypeInfo.IsOrgDependent,
      this.packageLogger
    );
    SFPLogger.log("Package Id", packageTypeInfo.Id, this.packageLogger);
    SFPLogger.log("-------------------------", null, this.packageLogger);



    //cleanup sfpowerscripts constructs in working directory
    this.deleteSFPowerscriptsAdditionsToManifest(workingDirectory);

    //Resolve the package dependencies
    if (this.isOrgDependentPackage) {
      // Store original dependencies to artifact
      this.packageArtifactMetadata.dependencies =
        packageDescriptor["dependencies"];
    } else if (!this.isOrgDependentPackage && !this.isSkipValidation) {
      // With dependencies, so fetch it again
      this.resolvePackageDependencies(packageDescriptor, workingDirectory);
      //Redo the fetch of the descriptor as the above command would have redone the dependencies
      packageDescriptor = ProjectConfig.getSFDXPackageDescriptor(
        workingDirectory,
        this.sfdx_package
      );
      //Store the resolved dependencies
      this.packageArtifactMetadata.dependencies =
        packageDescriptor["dependencies"];
    } else {
      this.packageArtifactMetadata.dependencies =
        packageDescriptor["dependencies"];
    }

    this.packageArtifactMetadata.payload = sfppackage.payload;
    this.packageArtifactMetadata.metadataCount = sfppackage.metadataCount;
    this.packageArtifactMetadata.assignPermSetsPreDeployment = sfppackage.assignPermSetsPreDeployment;
    this.packageArtifactMetadata.assignPermSetsPostDeployment = sfppackage.assignPermSetsPostDeployment;
    this.packageArtifactMetadata.isApexFound = sfppackage.isApexInPackage
    this.packageArtifactMetadata.isProfilesFound = sfppackage.isProfilesInPackage;

    let command = this.buildExecCommand();
    let output = "";
    SFPLogger.log("Package Creation Command", command, this.packageLogger);
    let child = child_process.exec(command, {
      cwd: workingDirectory,
      encoding: "utf8",
    });

    child.stderr.on("data", (data) => {
      SFPLogger.log(data.toString(), null, this.packageLogger);
    });

    child.stdout.on("data", (data) => {
      SFPLogger.log(data.toString(), null, this.packageLogger);
      output += data.toString();
    });

    await onExit(child);

    this.packageArtifactMetadata.package_version_id = JSON.parse(
      output
    ).result.SubscriberPackageVersionId;

    //Get the full details on the package
    await this.getPackageInfo();


    //Break if coverage is low
    if (this.isCoverageEnabled && !this.isOrgDependentPackage) {
      if(!this.packageArtifactMetadata.has_passed_coverage_check)
       throw new Error("This package has not meet the minimum coverage requirement of 75%");
    }

    //Generate Source Artifact
    let mdapiPackageArtifactDir = SourcePackageGenerator.generateSourcePackageArtifact(
      this.project_directory,
      this.sfdx_package,
      ProjectConfig.getSFDXPackageDescriptor(
        this.project_directory,
        this.sfdx_package
      )["path"],
      null,
      null,
      this.pathToReplacementForceIgnore
    );

    this.packageArtifactMetadata.sourceDir = mdapiPackageArtifactDir;

    //Add Timestamps
    let endTime = Date.now();
    let elapsedTime = endTime - startTime;
    this.packageArtifactMetadata.creation_details = {
      creation_time: elapsedTime,
      timestamp: Date.now(),
    };

    SFPStatsSender.logGauge(
      "package.metadatacount",
      this.packageArtifactMetadata.metadataCount,
      {
        package: this.packageArtifactMetadata.package_name,
        type: this.packageArtifactMetadata.package_type,
      }
    );

    SFPStatsSender.logElapsedTime(
      "package.elapsed.time",
      this.packageArtifactMetadata.creation_details.creation_time,
      {
        package: this.packageArtifactMetadata.package_name,
        type: this.packageArtifactMetadata.package_type,
        is_dependency_validated: String(
          this.packageArtifactMetadata.isDependencyValidated
        ),
      }
    );
    SFPStatsSender.logCount("package.created", {
      package: this.packageArtifactMetadata.package_name,
      type: this.packageArtifactMetadata.package_type,
      is_dependency_validated: String(
        this.packageArtifactMetadata.isDependencyValidated
      ),
    });

    if (this.packageArtifactMetadata.isDependencyValidated) {
      SFPStatsSender.logGauge(
        "package.testcoverage",
        this.packageArtifactMetadata.test_coverage,
        {
          package: this.packageArtifactMetadata.package_name,
          from: "createpackage",
        }
      );
    }

    return this.packageArtifactMetadata;
  }


  private deleteSFPowerscriptsAdditionsToManifest(workingDirectory: string) {
    let projectManifestFromWorkingDirectory = ProjectConfig.getSFDXPackageManifest(
      workingDirectory
    );
    let packageDescriptorInWorkingDirectory = ProjectConfig.getPackageDescriptorFromConfig(
      this.sfdx_package,
      projectManifestFromWorkingDirectory
    );

    //Cleanup sfpowerscripts constructs
    if (this.isOrgDependentPackage)
      delete packageDescriptorInWorkingDirectory["dependencies"];

    delete packageDescriptorInWorkingDirectory["type"];
    delete packageDescriptorInWorkingDirectory["assignPermSetsPreDeployment"];
    delete packageDescriptorInWorkingDirectory["assignPermSetsPostDeployment"];
    delete packageDescriptorInWorkingDirectory["skipDeployOnOrgs"];
    delete packageDescriptorInWorkingDirectory["skipTesting"];
    delete packageDescriptorInWorkingDirectory["skipCoverageValidation"];
    delete packageDescriptorInWorkingDirectory["ignoreOnStages"];
    delete packageDescriptorInWorkingDirectory["ignoreDeploymentErrors"];
    delete packageDescriptorInWorkingDirectory["preDeploymentScript"];
    delete packageDescriptorInWorkingDirectory["postDeploymentScript"];
    delete packageDescriptorInWorkingDirectory["aliasfy"];

    fs.writeJsonSync(
      path.join(workingDirectory, "sfdx-project.json"),
      projectManifestFromWorkingDirectory
    );
  }

  private async getPackageInfo() {
    while (true) {
      try {
        SFPLogger.log(
          "Fetching Version Number and Coverage details",
          null,
          this.packageLogger
        );
        let pkgInfoResultAsJSON = child_process.execSync(
          this.buildInfoCommand(
            this.packageArtifactMetadata.package_version_id
          ),
          {
            cwd: this.project_directory,
            encoding: "utf8",
          }
        );

        SFPLogger.log(
          "Package Info Fetched",
          pkgInfoResultAsJSON,
          this.packageLogger
        );

        let pkgInfoResult = JSON.parse(pkgInfoResultAsJSON);
        this.packageArtifactMetadata.isDependencyValidated = !this
          .isSkipValidation;
        this.packageArtifactMetadata.package_version_number =
          pkgInfoResult.result[0].packageVersionNumber;
        this.packageArtifactMetadata.test_coverage =
          pkgInfoResult.result[0].coverage;
        this.packageArtifactMetadata.has_passed_coverage_check =
          pkgInfoResult.result[0].HasPassedCodeCoverageCheck;
        break;
      } catch (error) {
        SFPLogger.log(
          "Unable to fetch package version info",
          null,
          this.packageLogger
        );
        console.log("Retrying...");
        await delay(2000);
        continue;
      }
    }
  }

  private async getPackageTypeInfos() {
    if (CreateUnlockedPackageImpl.packageTypeInfos == null) {
      CreateUnlockedPackageImpl.packageTypeInfos = await new PackageVersionListImpl(
        this.devhub_alias
      ).exec();
    }
    return CreateUnlockedPackageImpl.packageTypeInfos;
  }

  private resolvePackageDependencies(
    packageDescriptor: any,
    workingDirectory: string
  ) {
    SFPLogger.log("Resolving project dependencies", null, this.packageLogger);

    let resolveResult = child_process.execSync(
      `sfdx sfpowerkit:package:dependencies:list -p "${packageDescriptor["path"]}" -v "${this.devhub_alias}" -w --usedependencyvalidatedpackages`,
      { cwd: workingDirectory, encoding: "utf8" }
    );

    SFPLogger.log("Resolved Depenendecies", resolveResult, this.packageLogger);
  }

  private buildExecCommand(): string {
    let command = `sfdx force:package:version:create -p "${this.sfdx_package}"  -w ${this.wait_time} --definitionfile "${this.config_file_path}" --json`;

    if (this.version_number)
      command += `  --versionnumber ${this.version_number}`;

    if (this.installationkeybypass) command += ` -x`;
    else command += ` -k ${this.installationkey}`;

    if (this.packageArtifactMetadata.tag)
      command += ` -t "${this.packageArtifactMetadata.tag}"`;

    // TODO: Disabled temporarily until sfpowerkit dependencies list filters by branch
    // if (!isNullOrUndefined(this.packageArtifactMetadata.branch))
    //   command += ` --branch ${this.packageArtifactMetadata.branch}`;

    if (this.isCoverageEnabled && !this.isOrgDependentPackage) command += ` -c`;

    if (this.isSkipValidation && !this.isOrgDependentPackage)
      command += ` --skipvalidation`;

    command += ` -v "${this.devhub_alias}"`;

    return command;
  }

  private buildInfoCommand(subscriberPackageVersion: string): string {
    let command = `sfdx sfpowerkit:package:version:codecoverage -i ${subscriberPackageVersion}  --json`;

    command += ` -v "${this.devhub_alias}"`;

    return command;
  }
}

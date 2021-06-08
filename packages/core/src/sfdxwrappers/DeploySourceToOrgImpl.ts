import child_process = require("child_process");
import { delay } from "../utils/Delay";
import { onExit } from "../utils/OnExit";
import SFPLogger, { LoggerLevel } from "../utils/SFPLogger";
import PackageEmptyChecker from "../package/PackageEmptyChecker";
import PackageMetadataPrinter from "../display/PackageMetadataPrinter";
import ConvertSourceToMDAPIImpl from "./ConvertSourceToMDAPIImpl";
import PackageManifest from "../package/PackageManifest";
import DeployErrorDisplayer from "../display/DeployErrorDisplayer";
import * as fs from "fs-extra";

export interface DeploySourceResult {
  deploy_id: string;
  result: boolean;
  message: string;
}

export default class DeploySourceToOrgImpl {
  private mdapiDir: string;

  public constructor(
    private target_org: string,
    private project_directory: string,
    private source_directory: string,
    private deployment_options: any,
    private isToBreakBuildIfEmpty: boolean,
    private packageLogger?: any
  ) {}

  public async exec(): Promise<DeploySourceResult> {
    let commandExecStatus: boolean = false;
    let deploySourceResult = {} as DeploySourceResult;

    //Check empty conditions
    let status = PackageEmptyChecker.isToBreakBuildForEmptyDirectory(
      this.project_directory,
      this.source_directory,
      this.isToBreakBuildIfEmpty
    );
    if (status.result == "break") {
      deploySourceResult.result = false;
      deploySourceResult.message = status.message;
      return deploySourceResult;
    } else if (status.result == "skip") {
      deploySourceResult.result = true;
      deploySourceResult.message = "skip:" + status.message;
      return deploySourceResult;
    } else {
      SFPLogger.log(
        "Converting source to mdapi",
        null,
        this.packageLogger,
        LoggerLevel.DEBUG
      );

      this.mdapiDir = await new ConvertSourceToMDAPIImpl(
        this.project_directory,
        this.source_directory,
        this.packageLogger
      ).exec(true);
      PackageMetadataPrinter.printMetadataToDeploy(
        await new PackageManifest(this.mdapiDir).getManifest()
      );

      //Get Deploy ID
      let deploy_id = "";
      try {
        let command = this.buildExecCommand();
        SFPLogger.log("Executing Command:" + command, null, this.packageLogger);
        let result = child_process.execSync(command, {
          cwd: this.project_directory,
          encoding: "utf8",
        });

        let resultAsJSON = JSON.parse(result);
        deploy_id = resultAsJSON.result.id;
      } catch (error) {
        deploySourceResult.result = false;
        deploySourceResult.message = error;
        return deploySourceResult;
      }

      if (this.deployment_options["checkonly"])
        SFPLogger.log(
          `Validation only deployment  is in progress....  Unleashing the power of your code!`,
          null,
          this.packageLogger
        );
      else
        SFPLogger.log(
          `Deployment is in progress....  Unleashing the power of your code!`,
          null,
          this.packageLogger
        );

      // Loop till deployment completes to show status
      let result;
      while (true) {
        try {
          result = child_process.execSync(
            `sfdx force:mdapi:deploy:report --json -i ${deploy_id} -u "${this.target_org}"`,
            {
              cwd: this.project_directory,
              encoding: "utf8",
              stdio: ["pipe", "pipe", "ignore"],
              maxBuffer: 5*1024*1024
            }
          );
        } catch (err) {
          if (this.deployment_options["checkonly"])
            SFPLogger.log(`Validation Failed`, null, this.packageLogger);
          else SFPLogger.log(`Deployment Failed`, null, this.packageLogger);
          break;
        }

        let resultAsJSON = JSON.parse(result);
        if (resultAsJSON["status"] == 1) {
          SFPLogger.log(
            "Validation/Deployment Failed",
            null,
            this.packageLogger
          );
          commandExecStatus = false;
          break;
        } else if (
          resultAsJSON["result"]["status"] == "InProgress" ||
          resultAsJSON["result"]["status"] == "Pending"
        ) {
          SFPLogger.log(
            `Processing ${resultAsJSON.result.numberComponentsDeployed} out of ${resultAsJSON.result.numberComponentsTotal}`,
            null,
            this.packageLogger
          );
        } else if (resultAsJSON["result"]["status"] == "Succeeded") {
          SFPLogger.log(
            "Validation/Deployment Succeeded",
            null,
            this.packageLogger
          );
          commandExecStatus = true;
          break;
        }

        await delay(30000);
      }

      deploySourceResult.message = await this.getFinalDeploymentStatus(
        deploy_id
      );
      deploySourceResult.result = commandExecStatus;
      deploySourceResult.deploy_id = deploy_id;
      return deploySourceResult;
    }
  }

  private async getFinalDeploymentStatus(deploy_id: string): Promise<string> {
    SFPLogger.log(`Gathering Final Deployment Status`, null, this.packageLogger);
    let reportAsJSON="";
    try {
      let filepath=`sfpowerscripts/mdapiDeployReports`;
      fs.mkdirpSync(filepath);
      let child = child_process.exec(
        `sfdx force:mdapi:deploy:report --json -i ${deploy_id} -u "${this.target_org}"`,
        {
          cwd: this.project_directory,
          encoding: "utf8",
          maxBuffer: 5*1024*1024
        }
      );

      child.stdout.on("data", (data) => {
        reportAsJSON += data.toString();
      });


      child.stderr.on("data", (data) => {
        reportAsJSON += data.toString();
      });

      await onExit(child);

      return "Succesfully Deployed";
    } catch (err) {
      let report = JSON.parse(reportAsJSON);
      if(report.result.details.componentFailures && report.result.details.componentFailures.length>0)
      {
        DeployErrorDisplayer.printMetadataFailedToDeploy(
          report.result.details.componentFailures,this.packageLogger
        );
        return report.message;
      }
      else
      {
        return "Unable to fetch report";
      }
    }
  }

  private buildExecCommand(): string {
    let apexclasses;

    let command = `sfdx force:mdapi:deploy -u "${this.target_org}" --soapdeploy`;

    if (this.deployment_options["checkonly"]) command += ` -c`;

    //directory
    command += ` -d "${this.mdapiDir}"`;

    //add json
    command += ` --json`;

    if (this.deployment_options["testlevel"] == "RunApexTestSuite") {
      //testlevel
      command += ` -l RunSpecifiedTests`;
      apexclasses = this.convertApexTestSuiteToListOfApexClasses(
        this.deployment_options["apextestsuite"]
      );
      command += ` -r "${apexclasses}"`;
    } else if (this.deployment_options["testlevel"] == "RunSpecifiedTests") {
      command += ` -l RunSpecifiedTests`;
      apexclasses = this.deployment_options["specified_tests"];
      command += ` -r "${apexclasses}"`;
    } else {
      command += ` -l ${this.deployment_options["testlevel"]}`;
    }

    if (this.deployment_options["ignore_warnings"]) {
      command += ` --ignorewarnings`;
    }
    if (this.deployment_options["ignore_errors"]) {
      command += ` --ignoreerrors`;
    }

    return command;
  }

  private convertApexTestSuiteToListOfApexClasses(
    apextestsuite: string
  ): Promise<string> {
    SFPLogger.log(
      `Converting an apex test suite  ${apextestsuite} to its consituent apex test classes`,
      null,
      this.packageLogger
    );

    let result = child_process.execSync(
      `sfdx sfpowerkit:source:apextestsuite:convert  -n "${apextestsuite}" --json`,
      { cwd: this.project_directory, encoding: "utf8" }
    );

    let resultAsJSON = JSON.parse(result);
    if (resultAsJSON["status"] == 0) {
      return resultAsJSON["result"];
    } else {
      throw new Error(
        `Unable to convert apex test suite ${apextestsuite} ${resultAsJSON["message"]}`
      );
    }
  }
}

import child_process = require("child_process");

import {
  PackageInstallationResult,
  PackageInstallationStatus,
} from "../package/PackageInstallationResult";
import { onExit } from "../utils/OnExit";
import SFPLogger from "../utils/SFPLogger";

export default class InstallPackageDependenciesImpl {
  public constructor(
    private target_org: string,
    private devhub_alias: string,
    private wait_time: number,
    private working_directory: string,
    private keys: string,
    private apexcompileonlypackage: boolean,
    private packageLogger?:any
  ) {}

  public async exec(): Promise<PackageInstallationResult> {
    let command = `sfdx sfpowerkit:package:dependencies:install -u "${this.target_org}" -v "${this.devhub_alias}" -r -w ${this.wait_time}`;
    if (this.apexcompileonlypackage) command += ` -a`;
    if (this.keys != null && this.keys.length > 0)
      command += ` -k "${this.keys}"`;

    SFPLogger.log("Executing Command:", command,this.packageLogger);

    let child = child_process.exec(command, {
      cwd: this.working_directory,
      encoding: "utf8"
    });

    child.stderr.on("data", (data) => {
      SFPLogger.log(data.toString(),null,this.packageLogger);
    });

    child.stdout.on("data", (data) => {
      SFPLogger.log(data.toString(),null,this.packageLogger);
    });

    await onExit(child);

    return { result: PackageInstallationStatus.Succeeded };
  }
  catch(err) {
    return {
      result: PackageInstallationStatus.Failed,
      message: err.message,
    };
  }
}

import child_process = require("child_process");
import SFPLogger from "../utils/SFPLogger";
import { onExit } from "../utils/OnExit";

export default class PromoteUnlockedPackageImpl {
  public constructor(private  project_directory:string,private package_version_id: string, private devhub_alias: string) {}

  public async exec(): Promise<void> {

    let command = this.buildExecCommand();
    SFPLogger.log("Executing command",command);
    let child = child_process.exec(command, { cwd: this.project_directory, encoding: "utf8" });

    child.stdout.on("data", data => {
      SFPLogger.log(data.toString());
    });

    child.stderr.on("data", data => {
      SFPLogger.log(data.toString());
    });

    await onExit(child);
  }

  private  buildExecCommand(): string {
    let command = `sfdx force:package:version:promote -v "${this.devhub_alias}"`;
    //package
    command += ` -p ${this.package_version_id}`;
    //noprompt
    command += ` -n`;
    return command;
  }
}

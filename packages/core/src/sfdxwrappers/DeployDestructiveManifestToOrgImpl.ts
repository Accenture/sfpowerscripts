import child_process = require("child_process");
import SFPLogger from "../utils/SFPLogger";
import { onExit } from "../utils/OnExit";

export default class DeployDestructiveManifestToOrgImpl {
  public constructor(
    private target_org: string,
    private destructiveManifestPath: string
  ) {}

  public async exec() {

    let command = this.buildExecCommand();
    let child = child_process.exec(
      command,
      { encoding: "utf8" }
    );

    child.stdout.on("data", data => {
      SFPLogger.log(data.toString());
    });
    child.stderr.on("data", data => {
      SFPLogger.log(data.toString());
    });

    await onExit(child);
  }

  private  buildExecCommand(): string {
    let command = `sfdx sfpowerkit:org:destruct -u "${this.target_org}" -m "${this.destructiveManifestPath}"`;


    return command;
  }
}

import child_process = require("child_process");
import SFPLogger from "../utils/SFPLogger";
import { onExit } from "../utils/OnExit";

export default class CreateScratchOrgImpl {
  public constructor(
    private working_directory: string,
    private config_file_path: string,
    private devhub: string,
    private alias: string,
    private daysToMaintain: number
  ) {}

  public async exec(command: string): Promise<any> {
    let child = child_process.exec(
      command,
      { cwd: this.working_directory, encoding: "utf8" }
    );

    child.stderr.on("data", data => {
      SFPLogger.log(data.toString());
    });

    let output = "";
    child.stdout.on("data", data => {
      SFPLogger.log(data.toString());
      output += data.toString();
    });




    await onExit(child);

    let result = JSON.parse(output);

    return result;
  }

  public async buildExecCommand(): Promise<string> {
    let command = `npx sfdx force:org:create -v "${this.devhub}" -s -f "${this.config_file_path}" --json -a "${this.alias}" -d ${this.daysToMaintain}`;
    return command;
  }
}

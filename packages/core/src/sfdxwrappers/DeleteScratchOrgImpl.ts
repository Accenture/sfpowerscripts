import child_process = require("child_process");
import Logger from "../utils/Logger";

export default class DeleteScratchOrgImpl {
  
  public constructor(private target_org: string, private devhub: string) {}

  public async exec(command: string): Promise<void> {
    let result = child_process.execSync(command, {
      encoding: "utf8" 

    });
   Logger.log(result);
  }

  public async buildExecCommand(): Promise<string> {
    let command = `npx sfdx force:org:delete -u  ${this.target_org} -v ${this.devhub} -p`;
    return command;
  }

  
}

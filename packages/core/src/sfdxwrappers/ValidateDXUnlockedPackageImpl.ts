import child_process = require("child_process");
import { onExit } from "../utils/OnExit";
import SFPLogger from "../utils/SFPLogger";


export default class ValidateDXUnlockedPackageImpl {
  public constructor(private validate_package: string,private bypass:string, private project_directory: string) {}

  public async exec(command: string): Promise<void> {

    let child=child_process.exec(command,  { encoding: "utf8", cwd:this.project_directory });

    child.stdout.on("data",data=>{SFPLogger.log(data.toString()); });
    child.stderr.on("data",data=>{SFPLogger.log(data.toString()); });


    await onExit(child);

  }

  public async buildExecCommand(): Promise<string> {

    let command;
        command = `sfdx sfpowerkit:package:valid`;


    if(this.validate_package)
    command+=` -n "${this.validate_package}"`;

    if(this.bypass)
    command+=` -b "${this.bypass}"`;


    return command;
  }


}

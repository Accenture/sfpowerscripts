import child_process = require("child_process");
import SFPLogger from "../utils/SFPLogger";

export default class ValidateTestCoveragePackageImpl {


  public constructor(private target_org: string, private required_coverage: number, private package_version_id:string) {}

  public async exec(command: string): Promise<void> {
    let output = child_process.execSync(command, {
      encoding: "utf8"
    });
    let result = JSON.parse(output);
    if( Number(result.result.coverage) < this.required_coverage)
     throw new Error(`Package Code Coverage is currently at ${result.result.coverage}, which is less than the required coverage ${ this.required_coverage} `);

    SFPLogger.log(`Package Code Coverage is currently at ${result.result.coverage}`);
  }

  public async buildExecCommand(): Promise<string> {
    let command = `sfdx sfpowerkit:package:version:codecoverage -v  "${this.target_org}" -i ${this.package_version_id} --json`;

    return command;
  }


}

import child_process = require("child_process");
import SFPLogger from "../utils/SFPLogger";


export default class ValidateApexCoverageImpl  {
  public constructor(
    private target_org: string,
    private required_coverage: number
  ) {}

  public exec(): number {
    let result = child_process.execSync(this.buildExecCommand(), {
      encoding: "utf8",
    });
    let resultAsJSON = JSON.parse(result);

    if (Number(resultAsJSON.result.coverage) < this.required_coverage)
      throw new Error(
        `Org Coverage is currently at ${resultAsJSON.result.coverage}, which is less than the required coverage ${this.required_coverage} `
      );

    SFPLogger.log(
      `Org Coverage is currently at ${resultAsJSON.result.coverage}`
    );

    return resultAsJSON.result.coverage;
  }

  private buildExecCommand(): string {
    let command = `npx sfdx sfpowerkit:org:orgcoverage -u "${this.target_org}" --json`;
    return command;
  }
}

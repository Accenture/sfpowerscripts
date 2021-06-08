import { SFDXCommand } from "../SFDXCommand";
import { RunAllTestsInOrg, RunApexTestSuitesOption, RunLocalTests, RunSpecifiedTestsOption, TestOptions } from "./TestOptions";

export default class TriggerApexTestImpl extends SFDXCommand {
  public constructor(
    target_org: string,
    project_directory: string,
    private testOptions: TestOptions
  ) {
    super(target_org, project_directory);
  }

  getCommandName(): string {
    return "TriggerApexTest";
  }

  getGeneratedSFDXCommandWithParams(): string {
    let command;

    command = `sfdx force:apex:test:run -u "${this.target_org}"`;

    if (this.testOptions.synchronous) command += " --synchronous";

    command += ` --wait=${this.testOptions.wait_time}`;
    command += ` --resultformat=json`;
    command += ` --codecoverage`;
    command += ` --outputdir="${this.testOptions.outputdir}" `;

    if (this.testOptions instanceof RunSpecifiedTestsOption)
      command += this.buildCommandForSpecifiedTests(this.testOptions);
    else if (this.testOptions instanceof RunApexTestSuitesOption)
      command += this.buildCommandForApexTestSuite(this.testOptions);
    else if (this.testOptions instanceof RunLocalTests)
      command += this.buildCommandForLocalTestInOrg(this.testOptions);
    else if (this.testOptions instanceof RunAllTestsInOrg)
      command += this.buildCommandForAllTestInOrg(this.testOptions);

    return command;
  }

  buildCommandForApexTestSuite(testOptions: RunApexTestSuitesOption) {
    return `--testlevel=${testOptions.testLevel} --suitenames="${testOptions.suiteNames}"`;
  }

  private buildCommandForSpecifiedTests(
    testOptions: RunSpecifiedTestsOption
  ): string {

    if(!testOptions.specifiedTests || testOptions.specifiedTests.length==0)
    {
      throw new Error(("No Apex Tests found in the package, Unable to proceed further"));
    }

    return `--testlevel=${testOptions.testLevel} --classnames="${testOptions.specifiedTests}"`;
  }
  private buildCommandForLocalTestInOrg(testOptions: RunLocalTests): string {
    return `--testlevel=${testOptions.testLevel}`;
  }
  private buildCommandForAllTestInOrg(testOptions: RunAllTestsInOrg): string {
    return `--testlevel=${testOptions.testLevel.toString()}`;
  }

  async executeCommand() {
    return super.exec(true);
  }
}

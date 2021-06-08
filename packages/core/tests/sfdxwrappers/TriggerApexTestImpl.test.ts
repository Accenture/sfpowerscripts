import {
  RunAllTestsInOrg,
  RunApexTestSuitesOption,
  RunLocalTests,
  RunSpecifiedTestsOption
} from "../../src/sfdxwrappers/TestOptions";
import {expect } from "@jest/globals";
import TriggerApexTestImpl from "../../src/sfdxwrappers/TriggerApexTestImpl";



describe("Given a target org, trigger apex tests should trigger with the correct command", () => {
  it("if specified tests is used, trigger tests with specified tests", () => {
    let triggerApexTestsImpl: TriggerApexTestImpl = new TriggerApexTestImpl(
      "test_org",
      null,
      new RunSpecifiedTestsOption(120, "ars", "test1,test2")
    );
    let command = triggerApexTestsImpl.getGeneratedSFDXCommandWithParams();
    expect(command).toMatch("sfdx force:apex:test:run -u \"test_org\" --wait=120 --resultformat=json --codecoverage --outputdir=\"ars\" --testlevel=RunSpecifiedTests --classnames=\"test1,test2\"");
    });

  it("if apextest suite option is used, generate apextestsuite command", () => {
    let triggerApexTestsImpl: TriggerApexTestImpl = new TriggerApexTestImpl(
      "test_org",
      null,
      new RunApexTestSuitesOption(120, "ars", "testsuite1,testsuite2")
    );
    let command = triggerApexTestsImpl.getGeneratedSFDXCommandWithParams();
    expect(command).toMatch("sfdx force:apex:test:run -u \"test_org\" --wait=120 --resultformat=json --codecoverage --outputdir=\"ars\" --testlevel=RunApexTestSuite --suitenames=\"testsuite1,testsuite2\"");
  });


  it("if localtest option is used, generate localtest command", () => {
    let triggerApexTestsImpl: TriggerApexTestImpl = new TriggerApexTestImpl(
      "test_org",
      null,
      new RunLocalTests(120, "ars")
    );
    let command = triggerApexTestsImpl.getGeneratedSFDXCommandWithParams();
    expect(command).toMatch("sfdx force:apex:test:run -u \"test_org\" --wait=120 --resultformat=json --codecoverage --outputdir=\"ars\" --testlevel=RunLocalTests");
  });


  it("if all test option is used, generate all test command", () => {
    let triggerApexTestsImpl: TriggerApexTestImpl = new TriggerApexTestImpl(
      "test_org",
      null,
      new RunAllTestsInOrg(120,"ars")
    );
    let command = triggerApexTestsImpl.getGeneratedSFDXCommandWithParams();
    expect(command).toMatch("sfdx force:apex:test:run -u \"test_org\" --wait=120 --resultformat=json --codecoverage --outputdir=\"ars\" --testlevel=RunAllTestsInOrg");
  });




});

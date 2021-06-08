import { SFDXCommand } from "../SFDXCommand";

export default class PackageVersionListImpl extends SFDXCommand
{

  public constructor(
    devhub: string
  ) {
    super(devhub, null);
  }

  public async exec(quiet?: boolean): Promise<any> {
    let result =JSON.parse( await super.exec(quiet));
    return result.result;
  }

  getCommandName(): string {
    return "PackageVersionList"
  }
  getGeneratedSFDXCommandWithParams(): string {
    return `sfdx force:package:list --json -v "${this.target_org}" `;
  }

}

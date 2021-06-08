
import { SFDXCommand } from "../SFDXCommand";
import { DeploymentCommandStatus } from "./DeploymentCommandStatus";



export type DeploymentStatus = {
  status: DeploymentCommandStatus;
  result?:any;
};


export default class DeploymentStatusImpl extends SFDXCommand {
  public constructor(
    targetOrg: string,
    private deploymentId: string
  ) {
    super(targetOrg, null);
  }

  public async exec(quiet?: boolean): Promise<DeploymentStatus> {

    let result;
    try
    {
     result = JSON.parse( await super.exec(quiet));
    } catch(error)
    {
      result=JSON.parse(error.message);
    }
    let deploymentStatus: DeploymentStatus;
    if (result.status == 1) {
      deploymentStatus = { status: DeploymentCommandStatus.FAILED,
      result:result.result
      };
    } else if (
      result["result"]["status"] == "InProgress" ||
      result["result"]["status"] == "Pending"
    ) {
      deploymentStatus = {
        status: DeploymentCommandStatus.INPROGRESS,
        result:result.result
      };
    } else if (result["result"]["status"] == "Succeeded") {
      deploymentStatus = {
        status: DeploymentCommandStatus.SUCCEEDED,
        result:result.result
      };
    }
    return deploymentStatus;
  }

  getCommandName(): string {
    return "DeploymentStatus";
  }
  getGeneratedSFDXCommandWithParams(): string {
    return `sfdx force:mdapi:deploy:report --json -i ${this.deploymentId} -u "${this.target_org}"`;
  }
}

import { core, flags, SfdxCommand } from "@salesforce/command";
import { AnyJson } from "@salesforce/ts-types";
import poolListImpl from "../../../impl/pool/PoolListImpl";
import { isNullOrUndefined } from "util";
import { ScratchOrg } from "../../../impl/pool/utils/ScratchOrgUtils";
i


// Initialize Messages with the current plugin directory
core.Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = core.Messages.loadMessages(
  "@dxatscale/sfpowerscripts",
  "scratchorg_poollist"
);

export default class List extends SfdxCommand {
  public static description = messages.getMessage("commandDescription");

  protected static requiresDevhubUsername = true;

  public static examples = [
    `$ sfdx sfpowerkit:pool:list -t core `,
    `$ sfdx sfpowerkit:pool:list -t core -v devhub`,
    `$ sfdx sfpowerkit:pool:list -t core -v devhub -m`,
    `$ sfdx sfpowerkit:pool:list -t core -v devhub -m -a`,
  ];

  protected static flagsConfig = {
    tag: flags.string({
      char: "t",
      description: messages.getMessage("tagDescription"),
      required: false,
    }),
    mypool: flags.boolean({
      char: "m",
      description: messages.getMessage("mypoolDescription"),
      required: false,
    }),
    allscratchorgs: flags.boolean({
      char: "a",
      description: messages.getMessage("allscratchorgsDescription"),
      required: false,
    }),
  };

  public async run(): Promise<AnyJson> {
 

    await this.hubOrg.refreshAuth();
    const hubConn = this.hubOrg.getConnection();

    this.flags.apiversion =
      this.flags.apiversion || (await hubConn.retrieveMaxApiVersion());

    let listImpl = new poolListImpl(
      this.hubOrg,
      this.flags.tag,
      this.flags.allscratchorgs
    );

    let result = await listImpl.execute();

    if (!this.flags.mypool && result.length > 0) {
      result.forEach((element) => {
        delete element.password;
      });
    }

    let scratchOrgInuse = result.filter(
      (element) => element.status === "In use"
    );
    let scratchOrgNotInuse = result.filter(
      (element) => element.status === "Available"
    );
    let scratchOrgInProvision = result.filter(
      (element) => element.status === "Provisioning in progress"
    );

    if (!this.flags.json) {
      if (result.length > 0) {
        this.ux.log(`======== Scratch org Details ========`);

        if (isNullOrUndefined(this.flags.tag)) {
          this.ux.log(`List of all the pools in the org`);

          this.logTagCount(result);
          this.ux.log("===================================");
        }

        if (this.flags.allscratchorgs) {
          this.ux.log(
            `Used Scratch Orgs in the pool: ${scratchOrgInuse.length}`
          );
        }
        this.ux.log(
          `Unused Scratch Orgs in the Pool : ${scratchOrgNotInuse.length} \n`
        );
        if (scratchOrgInProvision.length && scratchOrgInProvision.length > 0) {
          this.ux.log(
            `Scratch Orgs being provisioned in the Pool : ${scratchOrgInProvision.length} \n`
          );
        }

        if (this.flags.mypool) {
          this.ux.table(result, [
            "tag",
            "orgId",
            "username",
            "password",
            "expityDate",
            "status",
            "loginURL",
          ]);
        } else {
          this.ux.table(result, [
            "tag",
            "orgId",
            "username",
            "expityDate",
            "status",
            "loginURL",
          ]);
        }
      } else {
        console.log(
          `${this.flags.tag} pool has No Scratch orgs available, time to create your pool.`
        );
      }
    }

    let output: any = {
      total:
        scratchOrgInuse.length +
        scratchOrgNotInuse.length +
        scratchOrgInProvision.length,
      inuse: scratchOrgInuse.length,
      unused: scratchOrgNotInuse.length,
      inprovision: scratchOrgInProvision.length,
      scratchOrgDetails: result,
    };

    return output;
  }

  private logTagCount(result: ScratchOrg[]) {
    let tagCounts: any = result.reduce(function (obj, v) {
      obj[v.tag] = (obj[v.tag] || 0) + 1;
      return obj;
    }, {});

    let tagArray = new Array<any>();

    Object.keys(tagCounts).forEach(function (key) {
      tagArray.push({
        tag: key,
        count: tagCounts[key],
      });
    });

    this.ux.table(tagArray, ["tag", "count"]);
  }
}

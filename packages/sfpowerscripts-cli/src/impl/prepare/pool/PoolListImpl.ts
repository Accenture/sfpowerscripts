import {Org} from "@salesforce/core";
import ScratchOrgUtils, { ScratchOrg } from "./utils/ScratchOrgUtils";

export default class PoolListImpl {
  private hubOrg: Org;

  private tag: string;
  private mypool: boolean;
  private allScratchOrgs: boolean;

  public constructor(
    hubOrg: Org,
    tag: string,
    mypool: boolean,
    allScratchOrgs: boolean
  ) {
    this.hubOrg = hubOrg;
    this.tag = tag;
    this.mypool = mypool;
    this.allScratchOrgs = allScratchOrgs;
  }

  public async execute(): Promise<ScratchOrg[]> {
    await ScratchOrgUtils.checkForNewVersionCompatible(this.hubOrg);
    const results = (await ScratchOrgUtils.getScratchOrgsByTag(
      this.tag,
      this.hubOrg,
      this.mypool,
      !this.allScratchOrgs
    )) as any;

    let scratchOrgList: ScratchOrg[] = new Array<ScratchOrg>();
    if (results.records.length > 0) {
  
      for (let element of results.records) {
        let soDetail: ScratchOrg = {};
        soDetail.tag = element.Pooltag__c;
        soDetail.orgId = element.ScratchOrg;
        soDetail.loginURL = element.LoginUrl;
        soDetail.username = element.SignupUsername;
        soDetail.password = element.Password__c;
        soDetail.expityDate = element.ExpirationDate;
        if (element.Allocation_status__c === "Assigned") {
          soDetail.status = "In use";
        } else if (
          (ScratchOrgUtils.isNewVersionCompatible &&
            element.Allocation_status__c === "Available") ||
          (!ScratchOrgUtils.isNewVersionCompatible &&
            !element.Allocation_status__c)
        ) {
          soDetail.status = "Available";
        } else {
          soDetail.status = "Provisioning in progress";
        }

        scratchOrgList.push(soDetail);
      }
    }

    return scratchOrgList;
  }
}

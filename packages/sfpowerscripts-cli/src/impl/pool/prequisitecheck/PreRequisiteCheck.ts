import { Org } from "@salesforce/core";
import PreRequisiteCheckError from "./PreRequisiteCheckError";
const retry = require("async-retry");

export default class PreRequisiteCheck {

  private static isPrerequisiteChecked: boolean = false;
  private static isPrerequisiteMet = false;
  private static describeResult;

  private hubOrg:Org;

  constructor(hubOrg:Org)
  {
    this.hubOrg = hubOrg;
  }

  
  public async checkForPrerequisites() {
 
    let sfdxAuthUrlFieldExists=false;
    let conn = this.hubOrg.getConnection();
    let expectedValues = ["In Progress", "Available", "Allocate", "Assigned"];
    let availableValues: string[] = [];
    if (!PreRequisiteCheck.isPrerequisiteChecked) {
      await retry(
        async (bail) => {
            PreRequisiteCheck.describeResult = await conn
            .sobject("ScratchOrgInfo")
            .describe();
          if (PreRequisiteCheck.describeResult) {
            for (const field of PreRequisiteCheck.describeResult.fields) {
              if (field.name === "SfdxAuthUrl__c") {
                sfdxAuthUrlFieldExists = true;
              }

              if (
                field.name === "Allocation_status__c" &&
                field.picklistValues.length === 4
              ) {
                for (let picklistValue of field.picklistValues) {
                  if (picklistValue.active) {
                    availableValues.push(picklistValue.value);
                  }
                }
                break;
              }
            }
          }
        },
        { retries: 3, minTimeout: 30000 }
      );

      PreRequisiteCheck.isPrerequisiteChecked = true;
      //If there are values returned, its not compatible
      let statusValuesAvailable =
        expectedValues.filter((item) => {
          return !availableValues.includes(item);
        }).length == 0
          ? true
          : false;


      if(sfdxAuthUrlFieldExists && statusValuesAvailable)
              PreRequisiteCheck.isPrerequisiteMet=true
    }

    if (!PreRequisiteCheck.isPrerequisiteMet) {
      throw new PreRequisiteCheckError(
         `Required Prerequisite values in ScratchOrgInfo is missing in the DevHub` +
         `For more information Please refer https://github.com/Accenture/SFPLogger/blob/main/src_saleforce_packages/scratchorgpool/force-app/main/default/objects/ScratchOrgInfo/fields/Allocation_status__c.field-meta.xml \n`,
          PreRequisiteCheck.describeResult.fields,
       );
     }
  }

}
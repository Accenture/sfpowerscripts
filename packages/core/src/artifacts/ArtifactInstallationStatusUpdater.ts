import child_process = require("child_process");
import PackageMetadata from "../PackageMetadata";
import SFPLogger, { LoggerLevel } from "../utils/SFPLogger";
import InstalledAritfactsFetcher from "./InstalledAritfactsFetcher";
const retry = require("async-retry");

//Update sfpowerscripts Artifats installed in an Org
export default class ArtifactInstallationStatusUpdater {




  public static async updatePackageInstalledInOrg(
    target_org: string,
    packageMetadata: PackageMetadata,
    isHandledByCaller: boolean,
    packageLogger?:any
  ):Promise<boolean> {
    if (isHandledByCaller) return true; //This is to be handled by the caller, in that case if it reached here, we should
                                        //just ignore

    try {
      return  await ArtifactInstallationStatusUpdater.updateArtifact(target_org, packageMetadata, packageLogger);
    } catch (error) {
      SFPLogger.log(
        "Unable to update details about artifacts to the org",error,packageLogger,LoggerLevel.DEBUG
      );
      return false;
    }
  }


  private static async updateArtifact(
    username: string,
    packageMetadata: PackageMetadata,
    packageLogger?:any
  ): Promise<boolean> {


    let artifactId = await ArtifactInstallationStatusUpdater.getRecordId(
      username,
      packageMetadata
    );



    return await retry(
      async (bail) => {

        let cmdOutput;
        let packageName= packageMetadata.package_name;
        SFPLogger.log("Updating Org with new Artifacts "+packageName+" "+packageMetadata.package_version_number+" "+(artifactId?artifactId:""), null, packageLogger, LoggerLevel.INFO);
        if (artifactId == null) {
          cmdOutput = child_process.execSync(
            `sfdx force:data:record:create --json -s SfpowerscriptsArtifact__c -u "${username}"  -v "Name='${packageName}' Tag__c='${packageMetadata.tag}' Version__c=${packageMetadata.package_version_number} CommitId__c=${packageMetadata.sourceVersion}"`,
            { encoding: "utf8",stdio:"pipe"}
          );
        } else if (artifactId) {
          cmdOutput = child_process.execSync(
            `sfdx force:data:record:update --json -s SfpowerscriptsArtifact__c -u "${username}" -v "Name='${packageName}' Tag__c='${packageMetadata.tag}' Version__c=${packageMetadata.package_version_number} CommitId__c=${packageMetadata.sourceVersion}" -i ${artifactId}`,
            { encoding: "utf8" ,stdio:"pipe"}
          );
        }


        let result = JSON.parse(cmdOutput);

        if (result["status"] == 0 && result["result"]["success"]) {
          return true;
        } else {
          bail(
            new Error(
              "Unable to update any sfpowerscripts artifacts in the org\n" +
                "1. No permissions available to update the object \n" +
                "2. The required prerequisite object is not deployed to this org\n"
            )
          );
        }
      },
      { retries: 3, minTimeout: 2000 }
    );
  }

  private static async getRecordId(
    username: string,
    packageMetadata: PackageMetadata
  ): Promise<string> {
    let installedArtifacts = await InstalledAritfactsFetcher.getListofArtifacts(
      username
    );

    let packageName = packageMetadata.package_name;
    for (const artifact of installedArtifacts) {
      if (
        artifact.Name === packageName
      ) {
        return artifact.Id;
      }
    }
    return null;
  }
}

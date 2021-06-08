import child_process = require("child_process");
import SFPLogger from "../../utils/SFPLogger";
import AliasListImpl from "../../sfdxwrappers/AliasListImpl";
import PermsetListImpl from "../../sfdxwrappers/PermsetListImpl";
const Table = require("cli-table");

export default class AssignPermissionSetsImpl {
  constructor(
    private target_org: string,
    private permSets: string[],
    private project_directory: string,
    private packageLogger?: string
  ) {}

  public exec(): {
    successfullAssignments: {
      username: string;
      permset: string;
    }[];
    failedAssignments: {
      username: string;
      permset: string;
    }[];
  } {
    // Fetch username if alias is provied
    let username: string = this.convertAliasToUsername(this.target_org);
    let assignedPermSets = new PermsetListImpl(
      username,
      this.target_org
    ).exec();

    let failedAssignments: {
      username: string;
      permset: string;
    }[] = new Array();
    let successfullAssignments: {
      username: string;
      permset: string;
    }[] = new Array();

    for (let permSet of this.permSets) {
      let permSetAssignmentMatch = assignedPermSets.find((record) => {
        return record.PermissionSet.Name === permSet;
      });

      if (permSetAssignmentMatch !== undefined) {
        // Treat permsets that have already been assigned as successes
        successfullAssignments.push({ username: username, permset: permSet});
        continue;
      }

      try {
        let permsetAssignmentJson: string = child_process.execSync(
          `npx sfdx force:user:permset:assign -n "${permSet}" -u "${username}" --json`,
          {
            cwd: this.project_directory,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "inherit"],
          }
        );

        let permsetAssignment = JSON.parse(permsetAssignmentJson);
        if (permsetAssignment.status === 0)
          successfullAssignments.push({ username: username, permset: permSet });
        else failedAssignments.push({ username: username, permset: permSet });
      } catch (err) {
        failedAssignments.push({ username: username, permset: permSet });
      }
    }

    if (successfullAssignments.length > 0) {
      SFPLogger.log("Successful PermSet Assignments:", null, this.packageLogger);
      this.printPermsetAssignments(successfullAssignments);
    }

    if (failedAssignments.length > 0) {
      SFPLogger.log("Failed PermSet Assignments", null, this.packageLogger);
      this.printPermsetAssignments(failedAssignments);
    }

    return { successfullAssignments, failedAssignments };
  }

  private convertAliasToUsername(alias: string) {
    let aliasList = new AliasListImpl().exec();

    let matchedAlias = aliasList.find((elem) => {
      return elem.alias === alias;
    });

    if (matchedAlias !== undefined)
      return matchedAlias.value;
    else
      return alias;
  }

  private printPermsetAssignments(
    assignments: { username: string; permset: string }[]
  ) {
    let table = new Table({
      head: ["Username", "Permission Set Assignment"],
    });

    assignments.forEach((assignment) => {
      table.push([assignment.username, assignment.permset]);
    });

    SFPLogger.log(table.toString(), null, this.packageLogger);
  }
}

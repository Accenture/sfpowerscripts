import child_process = require("child_process");

/*
 * Retrieve Permsets for a user from a target org
 */
export default class PermSetImpl {
  constructor(private username: string, private target_org: string) {}
  public exec() {
    //Find all permsets assigned to this user
    let queryResultJSON: string = child_process.execSync(
      `sfdx force:data:soql:query -q "SELECT Id, PermissionSet.Name, Assignee.Username FROM PermissionSetAssignment WHERE Assignee.Username = '${this.username}'" -u "${this.target_org}" --json`,
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "inherit"],
      }
    );
    let queryResult = JSON.parse(queryResultJSON);
    if (queryResult.status == 0) {
      return queryResult.result.records;
    } else {
      throw new Error(
        `Failed to query permission set assignments for ${this.username}`
      );
    }
  }
}

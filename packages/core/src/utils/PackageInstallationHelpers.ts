import child_process = require("child_process");
import AssignPermissionSetsImpl from "../sfpcommands/permsets/AssignPermissionSetsImpl";

export default class PackageInstallationHelpers {
  static executeScript(
    script: string,
    sfdx_package: string,
    targetOrg: string
  ) {
    let cmd: string;
    if (process.platform !== "win32") {
      cmd = `bash -e "${script}" "${sfdx_package}" "${targetOrg}"`;
    } else {
      cmd = `cmd.exe /c "${script}" "${sfdx_package}" "${targetOrg}"`;
    }

    child_process.execSync(cmd, {
      cwd: process.cwd(),
      stdio: ["ignore", "inherit", "inherit"],
    });
  }

  static applyPermsets(
    permsets: string[],
    targetusername: string,
    sourceDirectory: string
  ) {
    let assignPermissionSetsImpl: AssignPermissionSetsImpl = new AssignPermissionSetsImpl(
      targetusername,
      permsets,
      sourceDirectory
    );

    let results = assignPermissionSetsImpl.exec();
    if (results.failedAssignments.length > 0)
      throw new Error("Unable to assign permsets");
  }
}

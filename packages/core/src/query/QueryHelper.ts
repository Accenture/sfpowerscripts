import { Connection } from "@salesforce/core";
const retry = require("async-retry");



export default class QueryHelper {


  static async query<T>(query: string, conn: Connection, isTooling: boolean): Promise<T[]> {
    return await retry(
      async (bail) => {
        let records;
        if (isTooling)
          records = (await conn.tooling.query<T>(query)).records;
        else
          records = (await conn.query<T>(query)).records;

        return records;
      },
      { retries: 3, minTimeout: 2000 }
    );
  }
}
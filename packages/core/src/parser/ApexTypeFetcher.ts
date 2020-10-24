import fs from "fs-extra";
const path = require("path");
const glob = require("glob");

import { CommonTokenStream } from 'antlr4ts';
import { ParseTreeWalker } from "antlr4ts/tree/ParseTreeWalker";

import ApexTypeListener from "./listeners/ApexTypeListener";

import {
  ApexLexer,
  ApexParser,
  ApexParserListener,
  CaseInsensitiveInputStream,
  ThrowingErrorListener
} from "apex-parser";
import SFPLogger from "../utils/SFPLogger";

export default class ApexTypeFetcher {


  /**
   * Get Apex type of cls files in a search directory.
   * Sorts files into classes, test classes and interfaces.
   * @param searchDir
   */
  public getApexTypeOfClsFiles(searchDir: string): ApexSortedByType {
    const apexSortedByType: ApexSortedByType = {
      class: [],
      testClass: [],
      interface: [],
      parseError: []
    };

    let clsFiles: string[];
    if (fs.existsSync(searchDir)) {
      clsFiles = glob.sync(`**/*.cls`, {
        cwd: searchDir,
        absolute: true
      });
    } else {
      throw new Error(`Search directory does not exist`);
    }

    for (let clsFile of clsFiles) {

      let clsPayload: string = fs.readFileSync(clsFile, 'utf8');
      let fileDescriptor: FileDescriptor = {name: path.basename(clsFile, ".cls"), filepath: clsFile};

      // Parse cls file
      let compilationUnitContext;
      try {
        let lexer = new ApexLexer(new CaseInsensitiveInputStream(clsFile, clsPayload));
        let tokens: CommonTokenStream  = new CommonTokenStream(lexer);

        let parser = new ApexParser(tokens);
        parser.removeErrorListeners()
        parser.addErrorListener(new ThrowingErrorListener());

        compilationUnitContext = parser.compilationUnit();

      } catch (err) {
        SFPLogger.log(`Failed to parse ${clsFile}`);
        SFPLogger.log(err);

        fileDescriptor["error"] = err;

        // Manually parse class if error is caused by System.runAs() or testMethod modifier
        if (
          this.parseSystemRunAs(err, clsPayload) ||
          this.parseTestMethod(err, clsPayload)
        ) {
          SFPLogger.log(`Manually identified test class ${clsFile}`)
          apexSortedByType["testClass"].push(fileDescriptor);
        } else {
          apexSortedByType["parseError"].push(fileDescriptor);
        }
        continue;
      }

      let apexTypeListener: ApexTypeListener = new ApexTypeListener();

      // Walk parse tree to determine Apex type
      ParseTreeWalker.DEFAULT.walk(apexTypeListener as ApexParserListener, compilationUnitContext);

      let apexType = apexTypeListener.getApexType();

      if (apexType.class) {
        apexSortedByType["class"].push(fileDescriptor);
        if (apexType.testClass) {
          apexSortedByType["testClass"].push(fileDescriptor);
        }
      } else if (apexType.interface) {
        apexSortedByType["interface"].push(fileDescriptor);
      } else {
        fileDescriptor["error"] = {message: "Unknown Apex Type"};
        apexSortedByType["parseError"].push(fileDescriptor);
      }
    }
    return apexSortedByType;
  }

  /**
   * Bypass error parsing System.runAs()
   * @param error
   * @param clsPayload
   */
  private parseSystemRunAs(error, clsPayload: string): boolean {
    return (
      error["message"].includes("missing ';' at '{'") &&
      /System.runAs/i.test(clsPayload) &&
      /@isTest/i.test(clsPayload)
    );
  }

  /**
   * Bypass error parsing testMethod modifier
   * @param error
   * @param clsPayload
   */
  private parseTestMethod(error, clsPayload: string): boolean {
    return (
      error["message"].includes("no viable alternative at input") &&
      /testMethod/i.test(error["message"]) &&
      /testMethod/i.test(clsPayload)
    );
  }
}

export type ApexSortedByType= {
  class: FileDescriptor[],
  testClass: FileDescriptor[],
  interface: FileDescriptor[],
  parseError: FileDescriptor[]
}

export type FileDescriptor ={
  name: string
  filepath: string,
  error?: any
}

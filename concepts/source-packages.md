---
description: All the details about Source Packages
---

# Source Packages

## What is Source Package?

Source Packages is an sfpowerscripts construct which wrap the salesforce metadata \( in source format\), along with sfdx-project.json, some metadata information \(such as commit id, branch, tag\) etc in a versioned zip file, which can be deployed to a Salesforce Org using sfpowerscripts package installation command.

## How are Source Packages different from deploying a folder using source:deploy ?

Well, No difference, internally sfpowerscripts is using the same command to deploy it in to the Salesforce org.

## Why I should be using Source Packages instead of deploying a folder?

We have some added some additional enhancements that makes it worth taking a look  
    - **Ability to skip the package if already installed:** By keeping a record of the version of the package installed in the target org with the support of an unlocked package, sfpowerscripts can skip installation of source packages if it is already installed in the org  
   - **Optimized Deployment Mode:**  sfpowerscripts package installation commands can auto detect apex unit tests provided in the package, thus a package can be deployed to an Org by utilizing only the apex test classes provided in the package \(provided each class is having a code coverage of 75% or more by the apex classes in the package\) thus saving time spend on triggering local tests of all the apex classes in an org for every source packages in your repo  
-  **Versioned Artifact:**  Aligned with sfpowerscripts principle of traceability, every deployment is traceable to a versioned artifact, which is difficult to achieve when you are using a folder to deploy

## How do Source Packages compare against Unlocked Packages?

Source Packages are metadata deployments from a Salesforce perspective, it is a group of components that gets deployed into an org. Unlocked packages are first class Salesforce deployment construct, where the lifecycle is governed by the org, such as deleting/deprecating metadata, validating versions and lifecycle of the page.

## When should I be using Source Packages over Unlocked Packages?

We always recommend using unlocked packages over source packages whenever you can. As a matter of preference, this is our priority of approach packages  
Unlocked Packages &gt; Unlocked Packages \(org-dependent\) &gt; Source Packages &gt; Changesets  
  
Source Pages are typically used when you come across these constraints  
 -  Unsupported Metadata  
 -  Facing bugs while deploying the metadata using unlocked packages  
 -  Unlocked Package validation takes too long \(still we recommend go org-dependent,\)  
 -  Dealing with metadata that is global or org-specific in nature \(such as queues, profiles etc., which doesn't make sense to be packaged using unlocked package\)

## **What are my options with Source Packages?**

sfpowerscripts source packages support the following exclusive options in addition to other options supported by the orchestrator commands, All these options can be enabled by adding to the package descriptor in sfdx-project.json 

* **Optimized Deployment  \(`isOptimizedDeployment:<boolean>)` :** Control the behavior of testing of source packages during deployment, utilize the org 's coverage or better have apex unit tests that have 75% or more coverage for each class carried in the source package. Any source packages that do not have apex classes/triggers will be deployed without triggering tests  
* **Aliasfy \(  `aliasfy:<boolean>`  \)** :  Aliasfy  enables to deploy a subfolder in source package that matches the target org. For eg: you have a source package as listed below. During Installation, only the metadata contents of the folder that matches the alias gets deployed

![Source Packages with env-specific-folders](../.gitbook/assets/image%20%285%29.png)

* **Skip Testing \(  `skipTesting:<boolean>`  \)** :  Allows you to deploy a source package without triggering test to an Org. Please note, this is applicable only during  deployments to sandboxes,  apex tests are mandatory \(if your package contains apex classes/triggers\) during deployment to production
* **Reconcile Profiles \(  `reconcileProfiles:<boolean>` \) :**  By default, true, automatically  reconcile a profile existing in the source package against the target org. Read more about reconcile option [here](https://github.com/Accenture/sfpowerkit/discussions/410).
* **Apply Destructive Changes \( `destructiveChangePath:<path>)`**:Allows you to deploy a destructive manifest that need to be applied before deploying the package.

```text
  {
    "path": "path--to--package",
    "package": "name--of-the-package", //mandatory, when used with sfpowerscripts
    "versionNumber": "X.Y.Z.[NEXT/BUILDNUMBER]",
    "aliasfy": <boolean>, // Only for source packages, allows to deploy a subfolder whose name matches the alias of the org when using deploy command
    "isOptimizedDeployment": <boolean>  // default:true for source packages, Utilizes the apex classes in the package for deployment,
    "skipTesting":<boolean> //default:false, skip apex testing during installation of source package to a sandbox
    "skipCoverageValidation":<boolean> //default:false, skip apex coverage validation during validation phase,
    "destructiveChangePath:<path> // only for source, if enabled, this will be applied before the package is deployed
    "assignPermSetsPreDeployment: ["","",]
    "assignPermSetsPostDeployment: ["","",]
    "preDeploymentScript":<path> //All Packages
    "postDeploymentScript:<path> // All packages
    "reconcileProfiles:<boolean> //default:true Source Packages 
  }
```

## **Can I have an entire org composed of Source Packages?**

Of course, you can, you would get traceability in terms of packages in your CI/CD pipelines, and some nice functionality, however the benefits of validating dependencies and modular development would not be fully realized. There is also associated danger, as there is no locks associated with source packages, so another source package with same metadata component can overwrite a metadata component deployed by another package. For these, reasons, we always prefer unlocked packages.

## How  do I delete components deployed through an earlier version of Source Packages?

By utilizing a destructive manifest file, one could delete metadata components during a Source Package Installation. Add the `destructiveChangePath` in the package descriptor by directing to the path to the file that carries information on the component that needs to be uninstalled.






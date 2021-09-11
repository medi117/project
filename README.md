# Thesis #
The architecture of the project contains only a **Data owner** and a **Cloud Storage Provider**.
The expirements were run on [Nodejs](https://nodejs.org/en/) environment. So before we start
we need it to be installed first, then open the terminal and run the commands in the following order.
## 1 - Install dependencies ## 
```bash 
cd thesis && yarn
 ```
## 2 - Generate data ## 
`<arg>` in the command is the file size. Possible values `(8, 16, 32, 64, 128, 256,..., etc) mb`.
```bash
yarn generate-data <arg>
```
## 3 - Expirements ## 
Each work in the paper has a **script** in the `package.json` file. And to run the scripts, you need to open
two terminal windows. The first one to run the script of **the Cloud Storage Provider** and the second to run
either the **proposed work** or **related works**.
### 3.1 Proposed Work ### 
run CSP file: `yarn csp-bdmdi <arg>`.  
run DO file: `yarn bdmdi <arg>`.
### 3.2 Blockchain-based public auditing for big data in cloud storage ### 
run CSP file: `yarn csp-bpas <arg>`.  
run DO file: `yarn bpas <arg>`.
### 3.3 Blockchain based Data Integrity Service Framework for IoT data ### 
run CSP file: `yarn csp-bdisf <arg>`.  
run DO file: `yarn bdisf <arg>`.
### 3.1 Blockchain-based privacy-preserving remote data integrity checking scheme for IoT information systems ### 
run CSP file: `yarn csp-bprdi <arg>`.  
run DO file: `yarn bprdi <arg>`.

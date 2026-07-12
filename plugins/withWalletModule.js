const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Copies the local Wallet module's Swift into the Attend app target and adds
// it to the Xcode project (same approach as withActivityController).
function withWalletModule(config) {
  return withXcodeProject(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const iosPath = path.join(projectRoot, 'ios');
    const attendPath = path.join(iosPath, 'Attend');
    const xcodeProject = config.modResults;
    const targetName = 'Attend';

    if (!fs.existsSync(attendPath)) {
      fs.mkdirSync(attendPath, { recursive: true });
    }

    const moduleSourcePath = path.join(projectRoot, 'modules', 'wallet', 'ios');
    const files = ['WalletModule.swift'];

    for (const file of files) {
      const sourcePath = path.join(moduleSourcePath, file);
      const destPath = path.join(attendPath, file);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`[withWalletModule] Copied ${file} to ${destPath}`);
      } else {
        console.error(`[withWalletModule] Source file not found: ${sourcePath}`);
      }

      const filePath = `${targetName}/${file}`;
      const existingFile = xcodeProject.hasFile(filePath);
      if (!existingFile) {
        const group = xcodeProject.findPBXGroupKey({ name: targetName });
        if (group) {
          xcodeProject.addSourceFile(filePath, null, group);
          console.log(`[withWalletModule] Added ${file} to Xcode project`);
        } else {
          console.error(`[withWalletModule] Could not find group: ${targetName}`);
        }
      }
    }

    return config;
  });
}

module.exports = withWalletModule;

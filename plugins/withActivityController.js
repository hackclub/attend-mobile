const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withActivityController(config) {
  return withXcodeProject(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const iosPath = path.join(projectRoot, 'ios');
    const attendPath = path.join(iosPath, 'Attend');
    const xcodeProject = config.modResults;
    const targetName = 'Attend';
    
    // Ensure the Attend directory exists
    if (!fs.existsSync(attendPath)) {
      fs.mkdirSync(attendPath, { recursive: true });
    }
    
    // Source files from the module
    const moduleSourcePath = path.join(projectRoot, 'modules', 'activity-controller', 'ios');
    const files = ['Attributes.swift', 'ActivityControllerModule.swift'];
    
    for (const file of files) {
      const sourcePath = path.join(moduleSourcePath, file);
      const destPath = path.join(attendPath, file);
      
      // Copy the file if source exists
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`[withActivityController] Copied ${file} to ${destPath}`);
      } else {
        console.error(`[withActivityController] Source file not found: ${sourcePath}`);
      }
      
      // Add to Xcode project if not already present
      const filePath = `${targetName}/${file}`;
      const existingFile = xcodeProject.hasFile(filePath);
      if (!existingFile) {
        const group = xcodeProject.findPBXGroupKey({ name: targetName });
        if (group) {
          xcodeProject.addSourceFile(filePath, null, group);
          console.log(`[withActivityController] Added ${file} to Xcode project`);
        } else {
          console.error(`[withActivityController] Could not find group: ${targetName}`);
        }
      }
    }
    
    return config;
  });
}

module.exports = withActivityController;

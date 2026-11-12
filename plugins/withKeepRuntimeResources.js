// Release builds run with shrinkResources, which drops any resource the
// code doesn't reference by ID. Bundled JS assets (images, fonts, sounds)
// are packaged as res/raw and res/drawable entries named after their path
// (assets_*, node_modules_*) and loaded by name at runtime, so the shrinker
// sees them as unused and strips them. This keeps them.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const KEEP_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- @generated withKeepRuntimeResources -->
<resources xmlns:tools="http://schemas.android.com/tools"
    tools:keep="@raw/assets_*,@drawable/assets_*,@raw/node_modules_*,@drawable/node_modules_*" />
`;

module.exports = function withKeepRuntimeResources(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const rawDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'raw');
      await fs.promises.mkdir(rawDir, { recursive: true });
      await fs.promises.writeFile(path.join(rawDir, 'keep.xml'), KEEP_XML);
      return config;
    },
  ]);
};

module.exports.KEEP_XML = KEEP_XML;

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Reduce file watching to fix EMFILE error
config.watchFolders = [];
config.resolver.blockList = [
  /node_modules\/.*\/node_modules/,
];

module.exports = config;

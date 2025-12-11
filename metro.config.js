const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Reduce file watching to fix EMFILE error
config.watchFolders = [];
config.resolver.blockList = [
  /node_modules\/.*\/node_modules/,
];

module.exports = config;
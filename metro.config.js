const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Reduce file watching to fix EMFILE error
config.watchFolders = [];

module.exports = config;
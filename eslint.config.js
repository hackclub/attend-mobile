// Flat config consumed by `npm run lint`. Expo's shared config covers the
// React/React Native/TypeScript rules; the generated native folders and build
// output are not ours to lint.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/**', 'ios/**', 'android/**', 'dist/**', '.expo/**', 'coverage/**'],
  },
]);

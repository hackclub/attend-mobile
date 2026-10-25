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
  {
    rules: {
      // eslint-config-expo 58 pulls in eslint-plugin-react-hooks 7, whose React
      // Compiler rules flag ~30 existing patterns across the screens. They are
      // worth addressing, but each one changes render behaviour, so they are
      // warnings here rather than a blocker on the SDK upgrade.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      // False positive: `AndroidImportance` is re-exported from
      // expo-notifications via `export * from './NotificationChannelManager.types'`,
      // which this rule cannot follow. tsc resolves it fine.
      'import/namespace': 'off',
    },
  },
]);

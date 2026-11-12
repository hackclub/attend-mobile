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
  // Design-system hygiene: colours come from the theme (tokens, overlayTokens
  // and the other fixed sets in src/theme), icons from ui/Icon. Files that
  // carry colours as data (wallet badge artwork, pass and status palettes)
  // and tests are exempt.
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx'],
    ignores: [
      'src/theme/**',
      'src/assets/walletBadges.ts',
      'src/services/eventPassColors.ts',
      'src/services/statusDisplay.ts',
      '**/__tests__/**',
      '**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message: 'Use a theme token (useTheme().tokens, overlayTokens) instead of a hex colour.',
        },
        {
          selector: 'Literal[value=/^rgba?\\(/]',
          message: 'Use a theme token, or withAlpha() on one, instead of an rgb()/rgba() colour.',
        },
        {
          selector: 'TemplateElement[value.raw=/rgba?\\(|#[0-9a-fA-F]{3,8}\\b/]',
          message: 'Use a theme token, or withAlpha() on one, instead of building a colour string.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@expo/vector-icons', message: 'Use ui/Icon (Heroicons v1) instead.' }],
          patterns: [
            {
              group: ['**/theme/colors'],
              message: 'The legacy colours API is gone; use useTheme().tokens or overlayTokens.',
            },
          ],
        },
      ],
    },
  },
]);

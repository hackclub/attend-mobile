// Brand colours for the Android Material 3 theme.
//
// react-native-bottom-tabs' own plugin switches AppTheme's parent to
// Theme.Material3.DayNight.NoActionBar. On its own that leaves Material's
// baseline purple, so native widgets (the bottom navigation bar, alert
// dialogs, switches, text selection handles) wouldn't match the app.
//
// This plugin writes the M3 colour roles as colour resources, with a
// values-night copy for dark mode, and points AppTheme at them. The values
// mirror src/theme/tokens.ts: the surfaces are the tokens' `bg`/`shaded`, and
// the containers are the red tint pair. colorPrimary itself comes from
// `primaryColor` in app.json and is Hack Club red in both schemes, the same as
// the app's filled buttons (see the brand hues in src/theme/colors.ts).
const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
} = require('expo/config-plugins');

const PREFIX = 'brand_';

const LIGHT = {
  on_primary: '#FFFFFF',
  primary_container: '#FFE5E9',
  on_primary_container: '#7A0F20',
  surface: '#FFFFFF',
  on_surface: '#0F141A',
  surface_variant: '#EBEBF0',
  on_surface_variant: '#656871',
  // The bottom navigation bar's background in M3.
  surface_container: '#FFFFFF',
  outline: '#C6C6CD',
};

const DARK = {
  on_primary: '#FFFFFF',
  primary_container: '#3D121C',
  on_primary_container: '#FF7A8A',
  surface: '#161D26',
  on_surface: '#EBEBF0',
  surface_variant: '#232B37',
  on_surface_variant: '#A4A4AD',
  surface_container: '#1B232D',
  outline: '#424650',
};

// Theme attribute -> colour resource. The secondary container is the bottom
// navigation bar's active indicator, so it takes the red container too.
const THEME_ITEMS = {
  colorAccent: '@color/colorPrimary',
  colorOnPrimary: `@color/${PREFIX}on_primary`,
  colorPrimaryContainer: `@color/${PREFIX}primary_container`,
  colorOnPrimaryContainer: `@color/${PREFIX}on_primary_container`,
  colorSecondary: '@color/colorPrimary',
  colorOnSecondary: `@color/${PREFIX}on_primary`,
  colorSecondaryContainer: `@color/${PREFIX}primary_container`,
  colorOnSecondaryContainer: `@color/${PREFIX}on_primary_container`,
  colorSurface: `@color/${PREFIX}surface`,
  colorOnSurface: `@color/${PREFIX}on_surface`,
  colorSurfaceVariant: `@color/${PREFIX}surface_variant`,
  colorOnSurfaceVariant: `@color/${PREFIX}on_surface_variant`,
  colorSurfaceContainer: `@color/${PREFIX}surface_container`,
  colorOutline: `@color/${PREFIX}outline`,
};

function setColors(colors, palette) {
  let next = colors;
  for (const [name, value] of Object.entries(palette)) {
    next = AndroidConfig.Colors.assignColorValue(next, {
      name: `${PREFIX}${name}`,
      value,
    });
  }
  return next;
}

const withAndroidBrandTheme = (config) => {
  config = withAndroidColors(config, (c) => {
    c.modResults = setColors(c.modResults, LIGHT);
    return c;
  });

  config = withAndroidColorsNight(config, (c) => {
    c.modResults = setColors(c.modResults, DARK);
    return c;
  });

  config = withAndroidStyles(config, (c) => {
    let styles = c.modResults;
    for (const [name, value] of Object.entries(THEME_ITEMS)) {
      styles = AndroidConfig.Styles.assignStylesValue(styles, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name,
        value,
      });
    }
    c.modResults = styles;
    return c;
  });

  return config;
};

module.exports = withAndroidBrandTheme;

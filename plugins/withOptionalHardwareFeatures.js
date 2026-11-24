// Google Play treats some hardware features as required even though we never
// ask for them: a portrait-locked activity implies android.hardware.screen.portrait,
// and netinfo's ACCESS_WIFI_STATE permission implies android.hardware.wifi.
// Implied features block installs on devices without them (Chromebooks, XR,
// ethernet-only tablets), so declare them explicitly as optional.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

module.exports = function withOptionalHardwareFeatures(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] || [];

    for (const name of OPTIONAL_FEATURES) {
      const existing = manifest['uses-feature'].find((f) => f.$?.['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        manifest['uses-feature'].push({
          $: { 'android:name': name, 'android:required': 'false' },
        });
      }
    }
    return config;
  });
};

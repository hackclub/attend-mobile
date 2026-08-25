// Google Play flags any activity with android:screenOrientation set, and
// expo-camera's bundled Google code scanner declares its delegate activity
// portrait-only in the library manifest. We can't edit the library, but the
// manifest merger can strip the attribute from the merged result.
const { withAndroidManifest } = require('expo/config-plugins');

const SCANNER_ACTIVITY =
  'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

module.exports = function withScannerOrientationFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const application = manifest.application?.[0];
    if (!application) return config;

    application.activity = application.activity || [];
    const exists = application.activity.some(
      (activity) => activity.$?.['android:name'] === SCANNER_ACTIVITY
    );
    if (!exists) {
      application.activity.push({
        $: {
          'android:name': SCANNER_ACTIVITY,
          'tools:remove': 'android:screenOrientation',
        },
      });
    }
    return config;
  });
};

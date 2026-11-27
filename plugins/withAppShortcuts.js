// Launcher shortcuts (Android) and home screen quick actions (iOS):
// Scan, Search people and My tickets, each opening an attend:// deep link.
//
// Android: static shortcuts in res/xml/shortcuts.xml, referenced from the
// launcher activity. Each launches MainActivity with a VIEW intent for the
// deep link, which React Native's Linking delivers on cold and warm starts.
// Icons follow the app icon: a white Heroicons glyph on the brand red, as an
// adaptive icon on API 26+ and a round icon below that.
//
// iOS: static UIApplicationShortcutItems with SF Symbols. The deep link rides
// in userInfo.url; modules/app-shortcuts hands it to JS (useAppShortcutLaunch).
const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
  withStringsXml,
} = require('expo/config-plugins');

const BRAND = '#EC3750';

// Heroicons v1 outline paths (the app's icon set, see src/components/ui/Icon.tsx),
// with arc flags spelled out for Android's path parser.
const SHORTCUTS = [
  {
    id: 'scan',
    url: 'attend://scan',
    shortLabel: 'Scan',
    longLabel: 'Scan tickets',
    sfSymbol: 'qrcode.viewfinder',
    glyph:
      'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1zm12 0h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1zM5 20h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1z',
  },
  {
    id: 'people',
    url: 'attend://people',
    shortLabel: 'Search people',
    longLabel: 'Search people',
    sfSymbol: 'person.2',
    glyph:
      'M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  },
  {
    id: 'tickets',
    url: 'attend://tickets',
    shortLabel: 'My tickets',
    longLabel: 'My tickets',
    sfSymbol: 'ticket',
    glyph:
      'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 0 0-2 2v3a2 2 0 1 1 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 1 1 0-4V7a2 2 0 0 0-2-2H5z',
  },
];

const drawableName = (s) => `attend_shortcut_${s.id}`;
const stringName = (s, kind) => `attend_shortcut_${s.id}_${kind}`;

function glyphPath(glyph) {
  return `    <path
        android:fillColor="#00000000"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="2"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="${glyph}" />`;
}

// API 24–25: a 48dp round icon (44dp circle) with the glyph at 24dp.
function legacyIcon(s) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp"
    android:height="48dp"
    android:viewportWidth="48"
    android:viewportHeight="48">
  <path
      android:fillColor="${BRAND}"
      android:pathData="M24 2a22 22 0 1 1 0 44a22 22 0 1 1 0-44z" />
  <group android:translateX="12" android:translateY="12">
${glyphPath(s.glyph)}
  </group>
</vector>
`;
}

// API 26+: adaptive icon foreground on a 108dp canvas, glyph at 44dp in the middle.
function adaptiveForeground(s) {
  const scale = 44 / 24;
  const offset = (108 - 44) / 2;
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
  <group
      android:translateX="${offset}"
      android:translateY="${offset}"
      android:scaleX="${scale.toFixed(4)}"
      android:scaleY="${scale.toFixed(4)}">
${glyphPath(s.glyph)}
  </group>
</vector>
`;
}

function adaptiveIcon(s) {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/attend_shortcut_background" />
  <foreground android:drawable="@drawable/${drawableName(s)}_foreground" />
</adaptive-icon>
`;
}

function shortcutsXml(packageName) {
  const items = SHORTCUTS.map(
    (s) => `  <shortcut
      android:shortcutId="${s.id}"
      android:enabled="true"
      android:icon="@drawable/${drawableName(s)}"
      android:shortcutShortLabel="@string/${stringName(s, 'short')}"
      android:shortcutLongLabel="@string/${stringName(s, 'long')}">
    <intent
        android:action="android.intent.action.VIEW"
        android:targetPackage="${packageName}"
        android:targetClass="${packageName}.MainActivity"
        android:data="${s.url}" />
  </shortcut>`
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${items}
</shortcuts>
`;
}

const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="attend_shortcut_background">${BRAND}</color>
</resources>
`;

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function withAndroidShortcutResources(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const packageName = config.android?.package;
      if (!packageName) throw new Error('withAppShortcuts: android.package is required');
      const res = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
      write(path.join(res, 'xml/attend_shortcuts.xml'), shortcutsXml(packageName));
      write(path.join(res, 'values/attend_shortcut_colors.xml'), colorsXml);
      for (const s of SHORTCUTS) {
        write(path.join(res, `drawable/${drawableName(s)}.xml`), legacyIcon(s));
        write(path.join(res, `drawable/${drawableName(s)}_foreground.xml`), adaptiveForeground(s));
        write(path.join(res, `drawable-anydpi-v26/${drawableName(s)}.xml`), adaptiveIcon(s));
      }
      return config;
    },
  ]);
}

function withAndroidShortcutStrings(config) {
  return withStringsXml(config, (config) => {
    for (const s of SHORTCUTS) {
      config.modResults = AndroidConfig.Strings.setStringItem(
        [
          { $: { name: stringName(s, 'short') }, _: s.shortLabel },
          { $: { name: stringName(s, 'long') }, _: s.longLabel },
        ],
        config.modResults
      );
    }
    return config;
  });
}

function withAndroidShortcutMetadata(config) {
  return withAndroidManifest(config, (config) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    activity['meta-data'] = (activity['meta-data'] || []).filter(
      (m) => m.$['android:name'] !== 'android.app.shortcuts'
    );
    activity['meta-data'].push({
      $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/attend_shortcuts' },
    });
    return config;
  });
}

function withIosQuickActions(config) {
  return withInfoPlist(config, (config) => {
    const bundleId = config.ios?.bundleIdentifier || 'com.hackclub.attend';
    config.modResults.UIApplicationShortcutItems = SHORTCUTS.map((s) => ({
      UIApplicationShortcutItemType: `${bundleId}.${s.id}`,
      UIApplicationShortcutItemTitle: s.shortLabel,
      UIApplicationShortcutItemIconSymbolName: s.sfSymbol,
      UIApplicationShortcutItemUserInfo: { url: s.url },
    }));
    return config;
  });
}

module.exports = function withAppShortcuts(config) {
  config = withAndroidShortcutResources(config);
  config = withAndroidShortcutStrings(config);
  config = withAndroidShortcutMetadata(config);
  config = withIosQuickActions(config);
  return config;
};

module.exports.SHORTCUTS = SHORTCUTS;

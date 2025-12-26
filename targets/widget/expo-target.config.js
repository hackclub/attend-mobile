/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "widget",
  name: "AttendWidget",
  entitlements: {
    "com.apple.security.application-groups": ["group.com.hackclub.attend"],
  },
  frameworks: ["WidgetKit", "SwiftUI", "ActivityKit"],
};

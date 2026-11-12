// Some Android libraries (react-native-image-colors, for one) only set their
// Java/Kotlin targets on AGP < 8. On AGP 8+ their Java compile gets the 17
// that React Native's Gradle plugin assigns, while Kotlin falls back to the
// JDK it runs on (21 under JDK 21), and the build stops with "Inconsistent
// JVM-target compatibility ... (17) and ... (21)".
//
// This aligns every subproject's Kotlin jvmTarget with that same project's
// Java targetCompatibility, so the two always agree whatever the JDK is.
// It's resolved lazily when each Kotlin task is configured, after the
// library's own build script and the React Native plugin have run.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// @generated withKotlinJvmTargetFix';

const SNIPPET = `
${MARKER}
subprojects { sub ->
  sub.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach { task ->
    def android = sub.extensions.findByName('android')
    if (android == null) return
    def javaTarget = android.compileOptions.targetCompatibility
    if (javaTarget == null) return
    task.compilerOptions.jvmTarget.set(
      org.jetbrains.kotlin.gradle.dsl.JvmTarget.fromTarget(javaTarget.toString())
    )
  }
}
`;

function addKotlinJvmTargetFix(contents) {
  if (contents.includes(MARKER)) return contents;
  return `${contents.trimEnd()}\n${SNIPPET}`;
}

module.exports = function withKotlinJvmTargetFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withKotlinJvmTargetFix only supports a Groovy android/build.gradle');
    }
    config.modResults.contents = addKotlinJvmTargetFix(config.modResults.contents);
    return config;
  });
};

module.exports.addKotlinJvmTargetFix = addKotlinJvmTargetFix;

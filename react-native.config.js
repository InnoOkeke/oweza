/**
 * Provide a minimal react-native config so autolinking can
 * determine the Android package name when `react-native config`
 * is executed by the autolinking tool.
 */
module.exports = {
  project: {
    android: {
      // Match the `namespace` / applicationId used in `android/app/build.gradle`
      packageName: 'com.kellonapp.metasend'
    }
  }
}

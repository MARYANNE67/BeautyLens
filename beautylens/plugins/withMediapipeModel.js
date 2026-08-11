/**
 * Expo config plugin: bundle the MediaPipe face_landmarker.task model into
 * the native app.
 *
 * react-native-mediapipe loads models by *bundle-relative filename* --
 * iOS via Bundle.main.path(forResource:), Android from the app's assets/
 * directory -- so the file must ship inside the native app package, which
 * Expo prebuild doesn't do for arbitrary assets. This plugin copies
 * assets/models/face_landmarker.task into both native projects at prebuild
 * time (runs locally and in EAS builds; no manual Xcode step).
 */
const { withXcodeProject, withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const MODEL_FILE = 'face_landmarker.task';
const MODEL_SOURCE = path.join('assets', 'models', MODEL_FILE);

function withIosModel(config) {
  return withXcodeProject(config, (config) => {
    const src = path.join(config.modRequest.projectRoot, MODEL_SOURCE);
    const dest = path.join(config.modRequest.platformProjectRoot, MODEL_FILE);
    fs.copyFileSync(src, dest);

    if (!config.modResults.hasFile(MODEL_FILE)) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: MODEL_FILE,
        groupName: config.modRequest.projectName,
        project: config.modResults,
        isBuildFile: true,
      });
    }
    return config;
  });
}

function withAndroidModel(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const src = path.join(config.modRequest.projectRoot, MODEL_SOURCE);
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets'
      );
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.copyFileSync(src, path.join(assetsDir, MODEL_FILE));
      return config;
    },
  ]);
}

module.exports = function withMediapipeModel(config) {
  return withAndroidModel(withIosModel(config));
};

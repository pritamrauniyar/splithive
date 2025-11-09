import 'dotenv/config';

export default ({ config }) => {
  const env = process.env.APP_ENV || 'development';
  const apiBase =
    process.env.EXPO_PUBLIC_API_BASE ||
    (env === 'production'
      ? 'https://api.splithive.pritamrauniyar.com.np'
      : 'http://localhost:4000');

  return {
    ...config,
    name: config.name || 'SplitHive',
    slug: config.slug || 'splithive',
    version: config.version || '1.0.0',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0f172a'
    },
    ios: {
      ...(config.ios || {}),
      bundleIdentifier: (config.ios && config.ios.bundleIdentifier) || 'com.splithive.app',
      buildNumber: (config.ios && config.ios.buildNumber) || '1',
      supportsTablet: true
    },
    android: {
      ...(config.android || {}),
      package: (config.android && config.android.package) || 'com.splithive.app',
      versionCode: (config.android && config.android.versionCode) || 1,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0f172a'
      }
    },
    extra: {
      ...(config.extra || {}),
      EXPO_PUBLIC_API_BASE: apiBase,
      appEnv: env,
    },
  };
};

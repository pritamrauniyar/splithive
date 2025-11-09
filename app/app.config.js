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
    extra: {
      ...(config.extra || {}),
      EXPO_PUBLIC_API_BASE: apiBase,
      appEnv: env,
    },
  };
};


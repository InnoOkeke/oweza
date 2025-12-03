module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      [
        'module:react-native-dotenv',
        {
          moduleName: '@env',
          path: '.env',
          blocklist: null,
          allowlist: null,
          safe: false,
          allowUndefined: true,
        },
      ],
      [
        'module-resolver',
        {
          alias: {
            '@gemini-wallet/core': './empty-module.js',
            '@coinbase/wallet-sdk': './empty-module.js',
            '@keystonehq/sdk': './empty-module.js',
            '@ledgerhq/connect-kit-loader': './empty-module.js',
            'porto': './empty-module.js',
            'porto/internal': './empty-module.js',
            '@blocto/sdk': './empty-module.js',
            'magic-sdk': './empty-module.js',
          },
        },
      ],
    ],
    parserOpts: {
      plugins: ['deprecatedImportAssert'],
    },
    overrides: [
      {
        test: (filename) => {
          if (!filename) return false;
          const normalizedPath = filename.replace(/\\/g, '/');
          return normalizedPath.includes('node_modules/react-native-qrcode-svg/src/') ||
            normalizedPath.includes('node_modules/expo-barcode-generator/');
        },
        presets: ['module:metro-react-native-babel-preset'],
      },
    ],
  };
};

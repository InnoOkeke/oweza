const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    crypto: require.resolve('./crypto-polyfill'),
    browserCrypto: require.resolve('./crypto-polyfill'),
    stream: require.resolve('stream-browserify'),
    // Mock missing peer dependencies that are not needed for React Native
    '@gemini-wallet/core': require.resolve('./empty-module.js'),
    '@coinbase/wallet-sdk': require.resolve('./empty-module.js'),
    '@keystonehq/sdk': require.resolve('./empty-module.js'),
    '@ledgerhq/connect-kit-loader': require.resolve('./empty-module.js'),
    'porto': require.resolve('./empty-module.js'),
    '@blocto/sdk': require.resolve('./empty-module.js'),
    'magic-sdk': require.resolve('./empty-module.js'),
    // Mock wallet connector dependencies we don't need
    '@metamask/sdk': require.resolve('./empty-module.js'),
    '@safe-global/safe-apps-sdk': require.resolve('./empty-module.js'),
    '@safe-global/safe-apps-provider': require.resolve('./empty-module.js'),
    '@safe-global/protocol-kit': require.resolve('./empty-module.js'),
    '@walletconnect/ethereum-provider': require.resolve('./empty-module.js'),
    '@walletconnect/modal': require.resolve('./empty-module.js'),
    '@walletconnect/universal-provider': require.resolve('./empty-module.js'),
    'viem/window': require.resolve('./empty-module.js'),
    // buffer is included via react-native-quick-crypto polyfill
};

// Add resolver to handle subpath imports from mocked modules
const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    // If it's trying to import a subpath from a mocked module, return the empty module
    if (moduleName.includes('/empty-module.js/')) {
        return {
            filePath: path.resolve(__dirname, 'empty-module.js'),
            type: 'sourceFile',
        };
    }
    
    // Check if it's a subpath import from any of our mocked packages
    const mockedPackages = [
        'porto/',
        '@metamask/sdk/',
        '@safe-global/',
        '@walletconnect/',
        '@coinbase/wallet-sdk/',
        '@keystonehq/sdk/',
        '@ledgerhq/',
        '@gemini-wallet/',
        '@blocto/sdk/',
        'magic-sdk/',
    ];
    
    if (mockedPackages.some(pkg => moduleName.startsWith(pkg))) {
        return {
            filePath: path.resolve(__dirname, 'empty-module.js'),
            type: 'sourceFile',
        };
    }
    
    // Otherwise, use the default resolver
    if (defaultResolver) {
        return defaultResolver(context, moduleName, platform);
    }
    
    // Fallback to context's default resolver
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

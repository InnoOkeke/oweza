const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    crypto: require.resolve('./crypto-polyfill'),
    browserCrypto: require.resolve('./crypto-polyfill'),
    stream: require.resolve('stream-browserify'),
    // buffer is included via react-native-quick-crypto polyfill
};

module.exports = config;

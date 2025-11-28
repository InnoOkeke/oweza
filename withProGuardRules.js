const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withProGuardRules = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const proguardRulesPath = path.join(
                projectRoot,
                'android',
                'app',
                'proguard-rules.pro'
            );

            const rulesToAdd = `
# Rules for react-native-quick-crypto
-keep class com.margelo.quickcrypto.** { *; }

# Rules for Coinbase SDKs
-keep class com.coinbase.** { *; }
`;

            if (fs.existsSync(proguardRulesPath)) {
                const content = fs.readFileSync(proguardRulesPath, 'utf-8');
                if (!content.includes('com.margelo.quickcrypto')) {
                    fs.appendFileSync(proguardRulesPath, rulesToAdd);
                }
            } else {
                // If file doesn't exist, create it (though it usually exists in Expo projects)
                fs.writeFileSync(proguardRulesPath, rulesToAdd);
            }

            return config;
        },
    ]);
};

module.exports = withProGuardRules;

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withKotlinJvmTarget = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const buildGradlePath = path.join(projectRoot, 'android', 'build.gradle');

            if (fs.existsSync(buildGradlePath)) {
                let content = fs.readFileSync(buildGradlePath, 'utf-8');

                // Check if the Kotlin JVM target configuration already exists
                if (!content.includes('kotlinOptions')) {
                    // Find the allprojects block and add the Kotlin configuration
                    const allProjectsRegex = /(allprojects\s*{[\s\S]*?repositories\s*{[\s\S]*?})/;

                    if (allProjectsRegex.test(content)) {
                        content = content.replace(
                            /(allprojects\s*{[\s\S]*?repositories\s*{[\s\S]*?}\s*})/,
                            `$1
  
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    kotlinOptions {
      jvmTarget = "17"
    }
  }`
                        );

                        fs.writeFileSync(buildGradlePath, content);
                    }
                }
            }

            return config;
        },
    ]);
};

module.exports = withKotlinJvmTarget;

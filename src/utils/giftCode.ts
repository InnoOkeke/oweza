/**
 * Gift code generation utility
 * Generates unique gift codes in format: GIFT-{THEME_PREFIX}-{RANDOM}
 * Example: GIFT-BDAY-X7K9M2
 */

const THEME_PREFIXES: Record<string, string> = {
    birthday: "BDAY",
    anniversary: "ANNIV",
    holiday: "HOL",
    thank_you: "THX",
    congratulations: "CONGR",
    red_envelope: "RED",
    custom: "CUST",
};

/**
 * Generate a random alphanumeric string (uppercase)
 */
function generateRandomCode(length: number = 6): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Generate a unique gift code
 * @param theme - The gift theme (e.g., 'birthday', 'anniversary', 'red_envelope')
 * @returns Gift code in format GIFT-{THEME_PREFIX}-{RANDOM}
 */
export function generateGiftCode(theme: string): string {
    const prefix = THEME_PREFIXES[theme] || "GIFT";
    const randomPart = generateRandomCode();
    return `GIFT-${prefix}-${randomPart}`;
}

/**
 * Validate gift code format
 * @param code - The gift code to validate
 * @returns true if code matches expected format
 */
export function isValidGiftCode(code: string): boolean {
    // Format: GIFT-{THEME_PREFIX}-{RANDOM}
    const pattern = /^GIFT-[A-Z]+-[A-Z0-9]{6}$/;
    return pattern.test(code);
}

/**
 * Extract theme from gift code
 * @param code - The gift code
 * @returns Theme name or null if invalid
 */
export function extractThemeFromCode(code: string): string | null {
    if (!isValidGiftCode(code)) return null;

    const parts = code.split("-");
    if (parts.length < 2) return null;

    const prefix = parts[1];

    // Reverse lookup
    for (const [theme, themePrefix] of Object.entries(THEME_PREFIXES)) {
        if (themePrefix === prefix) return theme;
    }

    return null;
}

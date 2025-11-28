export type ColorPalette = {
  background: string;
  cardBackground: string;
  textPrimary: string;
  textSecondary: string;
  inverseText: string;
  primary: string;
  primaryDisabled: string;
  accent: string;
  accentDisabled: string;
  border: string;
  error: string;
  success: string;
  warning: string;
};

export const lightColors: ColorPalette = {
  background: "#F4F6F8",          // Soft Light Grey
  cardBackground: "#FFFFFF",
  textPrimary: "#1C1C1E",         // Charcoal
  textSecondary: "#5A6B7C",       // Greyish for secondary text
  inverseText: "#FFFFFF",
  primary: "#0A1A2F",             // Deep Navy
  primaryDisabled: "#4D5E75",
  accent: "#00B686",              // Emerald / Zen Green
  accentDisabled: "#80DBB3",
  border: "#E1E8ED",              // Light Grey
  error: "#E03B3B",               // Finance Red
  success: "#4ADEB5",             // Mint
  warning: "#F59E0B",
};

export const darkColors: ColorPalette = {
  background: "#0A1A2F",          // Deep Navy
  cardBackground: "#152945",      // Lighter Navy for cards
  textPrimary: "#F4F6F8",         // Soft Light Grey for text
  textSecondary: "#B0C4DE",       // Light Steel Blue
  inverseText: "#0A1A2F",
  primary: "#00B686",             // Emerald / Zen Green
  primaryDisabled: "#006B52",
  accent: "#4ADEB5",              // Mint
  accentDisabled: "#9AECD7",
  border: "#152945",              // Lighter Navy
  error: "#E03B3B",               // Finance Red
  success: "#4ADEB5",             // Mint
  warning: "#FBBF24",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const typography = {
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
};

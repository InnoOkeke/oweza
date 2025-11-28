import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ColorSchemeName, useColorScheme } from "react-native";

import { ColorPalette, darkColors, lightColors } from "../utils/theme";

export type ThemeScheme = "light" | "dark";

type ThemeContextValue = {
  scheme: ThemeScheme;
  colors: ColorPalette;
  setScheme: (scheme: ThemeScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [scheme, setScheme] = useState<ThemeScheme>(systemScheme === "dark" ? "dark" : "light");

  useEffect(() => {
    if (systemScheme === "light" || systemScheme === "dark") {
      setScheme(systemScheme);
    }
  }, [systemScheme]);

  const value = useMemo(
    () => ({
      scheme,
      colors: scheme === "dark" ? darkColors : lightColors,
      setScheme,
    }),
    [scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return ctx;
};

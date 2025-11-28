// Crypto polyfills are handled in index.ts
// Do not import polyfills here to avoid hoisting issues
import "./globals";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppKitProvider } from "./src/providers/AppKitProvider";
import { ThemeProvider, useTheme } from "./src/providers/ThemeProvider";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <ThemeProvider>
      <AppKitProvider>
        <SafeAreaProvider>
          <ThemedAppShell />
        </SafeAreaProvider>
      </AppKitProvider>
    </ThemeProvider>
  );
}

const ThemedAppShell: React.FC = () => {
  const { scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <RootNavigator />
    </>
  );
};

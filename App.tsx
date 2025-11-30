// Crypto polyfills are handled in index.ts
// Do not import polyfills here to avoid hoisting issues
import "./globals";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppKitProvider } from "./src/providers/AppKitProvider";
import { AppKitProvider as ReownAppKitProvider, AppKit } from '@reown/appkit-react-native';
import { appKit } from './src/AppKitConfig';
import { createConfig, WagmiProvider } from 'wagmi';
import { http } from 'viem';
import { CELO_CHAIN, CELO_RPC_URL } from './src/config/celo';
import { ThemeProvider, useTheme } from "./src/providers/ThemeProvider";
import { RootNavigator } from "./src/navigation/RootNavigator";


export default function App() {
  const wagmiConfig = createConfig({
    chains: [CELO_CHAIN],
    transports: {
      [CELO_CHAIN.id]: http(CELO_RPC_URL)
    }
  });

  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <ReownAppKitProvider instance={appKit}>
          <AppKitProvider>
            <SafeAreaProvider>
              <ThemedAppShell />
              {/* Render AppKit UI globally as per docs */}
              <AppKit />
            </SafeAreaProvider>
          </AppKitProvider>
        </ReownAppKitProvider>
      </WagmiProvider>
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

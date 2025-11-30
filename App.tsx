// Crypto polyfills are handled in index.ts
// Do not import polyfills here to avoid hoisting issues
import "./globals";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppKitProvider } from "./src/providers/AppKitProvider";
import { AppKitProvider as ReownAppKitProvider, AppKit } from '@reown/appkit-react-native';
import { appKit } from './src/AppKitConfig';
// Use runtime requires to avoid TypeScript definition mismatches for wagmi/viem
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const wagmiPkg: any = require('wagmi');
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const viemPkg: any = require('viem');
const createPublicClient = viemPkg.createPublicClient;
const http = viemPkg.http;
const createWagmiConfig: any = wagmiPkg.createConfig;
const WagmiConfig: any = wagmiPkg.WagmiConfig;
import { CELO_CHAIN, CELO_RPC_URL } from './src/config/celo';
import { ThemeProvider, useTheme } from "./src/providers/ThemeProvider";
import { RootNavigator } from "./src/navigation/RootNavigator";


export default function App() {
  const publicClient = createPublicClient({ chain: CELO_CHAIN, transport: http(CELO_RPC_URL) });
  const wagmiConfig = createWagmiConfig({ publicClient });

  return (
    <ThemeProvider>
      <WagmiConfig config={wagmiConfig}>
        <ReownAppKitProvider instance={appKit}>
          <AppKitProvider>
            <SafeAreaProvider>
              <ThemedAppShell />
              {/* Render AppKit UI globally as per docs */}
              <AppKit />
            </SafeAreaProvider>
          </AppKitProvider>
        </ReownAppKitProvider>
      </WagmiConfig>
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

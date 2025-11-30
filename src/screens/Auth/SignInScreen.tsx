import React, { useMemo } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  ImageBackground,
} from "react-native";

import { useAuth } from "../../providers/AppKitProvider";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useTheme } from "../../providers/ThemeProvider";
import type { ColorPalette } from "../../utils/theme";

const BgImage = require("../../../assets/bg.png");

export const SignInScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { login, loading, error, isConnected, profile } = useAuth();

  const handleSignIn = async () => {
    // Open Reown AppKit modal for email/Google/Apple authentication
    await login();
  };

  if (isConnected && profile) {
    return (
      <ImageBackground source={BgImage} style={styles.bgImage} resizeMode="cover">
        <View style={styles.containerCenter}>
          <Text style={styles.title}>✅ Signed In</Text>
          <Text style={styles.titleBold}>Email: {profile.email}</Text>
          <Text style={styles.titleBold}>Wallet: {profile.walletAddress.slice(0, 6)}...{profile.walletAddress.slice(-4)}</Text>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={BgImage} style={styles.bgImage} resizeMode="cover">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.bottomContent}>
          <View style={styles.buttonSection}>
            <Text style={styles.welcomeText}>Welcome to Oweza</Text>
            <Text style={styles.subtitleText}>
              Sign in with email, Google, or Apple to create your secure wallet
            </Text>
            
            <PrimaryButton
              title="Sign In"
              onPress={handleSignIn}
              loading={loading}
              disabled={loading}
              style={styles.socialButton}
            />
            
            <Text style={styles.helperText}>
              Powered by Reown • Secure authentication
            </Text>

            {error && <Text style={styles.errorText}>{error}</Text>}
            
            {loading && <Text style={styles.loadingText}>Opening authentication...</Text>}
          </View>

          <Text style={styles.disclaimer}>
            By proceeding, you agree to our <Text style={styles.link}>terms of service</Text> and{" "}
            <Text style={styles.link}>privacy policy</Text>. Built on Celo blockchain.
          </Text>
        </View>

      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    bgImage: {
      flex: 1,
      width: "100%",
      height: "100%",
    },
    container: {
      flex: 1,
    },
    bottomContent: {
      flex: 1,
      justifyContent: "flex-end", // push everything to the bottom
      paddingHorizontal: 24,
      paddingBottom: 32,
      width: "100%",
    },
    buttonSection: {
      gap: 16,
      width: "100%",
    },
    socialButton: {
      width: "100%",
      backgroundColor: "#ffffff",
      borderRadius: 24,
    },
    emailOutlineBtn: {
      width: "100%",
      paddingVertical: 16,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: "#FFFFFF",
      alignItems: "center",
      backgroundColor: "transparent",
    },
    emailOutlineText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "500",
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
      color: colors.textPrimary,
      fontSize: 16,
      width: "100%",
    },
    disclaimer: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 16,
    },
    link: {
      color: colors.primary,
      textDecorationLine: "underline",
    },
    title: { fontSize: 28 },
    titleBold: { fontSize: 32 },
    containerCenter: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    errorText: {
      color: colors.error,
      textAlign: "center",
      marginTop: 12,
    },
    loadingText: {
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 8,
      fontSize: 14,
    },
    welcomeText: {
      color: colors.textPrimary,
      textAlign: "center",
      fontSize: 28,
      fontWeight: "700",
      marginBottom: 8,
    },
    subtitleText: {
      color: colors.textSecondary,
      textAlign: "center",
      fontSize: 16,
      marginBottom: 24,
    },
    helperText: {
      color: colors.textSecondary,
      textAlign: "center",
      fontSize: 13,
      marginTop: 12,
    },

    /** MODAL **/
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    modalBox: {
      width: "100%",
      backgroundColor: colors.cardBackground || "#fff",
      padding: 24,
      borderRadius: 16,
      alignItems: "center",
      gap: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    modalSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 8,
    },
    closeButton: {
      position: "absolute",
      top: 12,
      right: 12,
      zIndex: 10,
    },
    closeButtonText: {
      fontSize: 22,
      color: colors.textPrimary,
    },
  });

import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  ImageBackground,
  TextInput,
  Alert,
} from "react-native";

import { useAuth } from "../../providers/Web3AuthProvider";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useTheme } from "../../providers/ThemeProvider";
import type { ColorPalette } from "../../utils/theme";

const BgImage = require("../../../assets/bg.png");

export const SignInScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { login, loading, error, isConnected, profile } = useAuth();
  const [email, setEmail] = useState('');



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
            {/* Email Login */}
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <PrimaryButton
              title="Continue with Email"
              onPress={() => {
                if (!email.trim()) {
                  Alert.alert('Error', 'Please enter your email address');
                  return;
                }
                login('email', email.trim());
              }}
              loading={loading}
              disabled={loading}
              style={styles.socialButton}
              textStyle={{ color: '#000' }}
            />

            {/* Google Login - Android only */}
            {Platform.OS === 'android' && (
              <PrimaryButton
                title="Continue with Google"
                onPress={() => login('google')}
                loading={loading}
                disabled={loading}
                style={[styles.socialButton, styles.googleButton]}
                textStyle={{ color: '#000' }}
              />
            )}

            {/* Apple Login - iOS only */}
            {Platform.OS === 'ios' && (
              <PrimaryButton
                title="Continue with Apple"
                onPress={() => login('apple')}
                loading={loading}
                disabled={loading}
                style={[styles.socialButton, styles.appleButton]}
              />
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            {loading && <Text style={styles.loadingText}>Authenticating...</Text>}
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
      marginBottom: 12,
    },
    appleButton: {
      backgroundColor: "#000000",
    },
    googleButton: {
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E1E8ED",
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

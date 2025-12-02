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
  Modal,
  TouchableOpacity,
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
  const [isEmailModalVisible, setIsEmailModalVisible] = useState(false);

  if (isConnected && profile) {
    return (
      <View style={styles.mainContainer}>
        <ImageBackground source={BgImage} style={styles.bgImageAbsolute} resizeMode="cover" />
        <View style={styles.containerCenter}>
          <Text style={styles.title}>✅ Signed In</Text>
          <Text style={styles.titleBold}>Email: {profile.email}</Text>
          <Text style={styles.titleBold}>Wallet: {profile.walletAddress.slice(0, 6)}...{profile.walletAddress.slice(-4)}</Text>
        </View>
      </View>
    );
  }

  const handleEmailLogin = () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    login('email', email.trim());
    // We don't close the modal immediately so the user sees the loading state
  };

  return (
    <View style={styles.mainContainer}>
      {/* Absolute Background Image */}
      <ImageBackground source={BgImage} style={styles.bgImageAbsolute} resizeMode="cover" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.contentContainer}
      >
        <View style={styles.bottomContent}>
          <View style={styles.buttonSection}>
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

            {/* Email Login Button - Opens Modal */}
            <PrimaryButton
              title="Continue with Email"
              onPress={() => setIsEmailModalVisible(true)}
              loading={loading}
              disabled={loading}
              style={[styles.socialButton, styles.emailButton]}
              textStyle={{ color: '#FFFFFF' }}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            {loading && <Text style={styles.loadingText}>Authenticating...</Text>}
          </View>

          <Text style={styles.disclaimer}>
            By proceeding, you agree to our <Text style={styles.link}>terms of service</Text> and{" "}
            <Text style={styles.link}>privacy policy</Text>. Built on Celo blockchain.
          </Text>
        </View>
      </KeyboardAvoidingView>

      {/* Email Input Modal - Outside KeyboardAvoidingView to prevent flickering */}
      <Modal
        visible={isEmailModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsEmailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsEmailModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Sign in with Email</Text>
            <Text style={styles.modalSubtitle}>
              Enter your email address to receive a login link. No password required.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={true}
            />

            <PrimaryButton
              title="Continue"
              onPress={handleEmailLogin}
              loading={loading}
              disabled={loading}
              style={{ width: '100%' }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    mainContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    bgImageAbsolute: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
    },
    contentContainer: {
      flex: 1,
    },
    // Removed old bgImage and container styles as they are replaced
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
    emailButton: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: "#FFFFFF",
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

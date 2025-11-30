import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  ImageBackground,
  TouchableOpacity,
  Modal,
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
  const [email, setEmail] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const handleEmailLogin = async () => {
    if (!email.trim()) return;
    await login("email_passwordless", email.trim());
  };

  const handleGoogleLogin = async () => await login("google");
  const handleAppleLogin = async () => await login("apple");

  if (isConnected && profile) {
    return (
      <ImageBackground source={BgImage} style={styles.bgImage} resizeMode="cover">
        <View style={styles.containerCenter}>
          <Text style={styles.title}>✅ Signed In</Text>
          <Text style={styles.titleBold}>Wallet: {profile.walletAddress}</Text>
          <Text style={styles.titleBold}>Email: {profile.email}</Text>
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
            {Platform.OS === "android" && (
              <PrimaryButton
                title="Continue with Google"
                onPress={handleGoogleLogin}
                loading={loading}
                disabled={loading}
                style={styles.socialButton}
              />
            )}

            {Platform.OS === "ios" && (
              <PrimaryButton
                title="Continue with Apple"
                onPress={handleAppleLogin}
                loading={loading}
                disabled={loading}
                style={[styles.socialButton, { backgroundColor: "#000" }]}
              />
            )}

            <TouchableOpacity
              style={styles.emailOutlineBtn}
              onPress={() => setModalVisible(true)}
              disabled={loading}
            >
              <Text style={styles.emailOutlineText}>Continue with Email</Text>
            </TouchableOpacity>

            {error && <Text style={styles.errorText}>{error}</Text>}
            
            {loading && <Text style={styles.loadingText}>Setting up your wallet...</Text>}
          </View>

          <Text style={styles.disclaimer}>
            By proceeding, you agree to our <Text style={styles.link}>terms of service</Text> and{" "}
            <Text style={styles.link}>privacy policy</Text>, built on Celo.
          </Text>
        </View>

        {/* MODAL POPUP */}
        <Modal
          transparent
          visible={modalVisible}
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>

              <Text style={styles.modalTitle}>Sign in with Email</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />

              <PrimaryButton
                title="Continue"
                onPress={handleEmailLogin}
                loading={loading}
                disabled={loading || !email.trim()}
                style={{ width: "100%" }}
              />
            </View>
          </View>
        </Modal>
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

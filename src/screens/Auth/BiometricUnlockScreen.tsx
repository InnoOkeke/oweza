import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { PrimaryButton } from "../../components/PrimaryButton";
import { useTheme } from "../../providers/ThemeProvider";
import type { ColorPalette } from "../../utils/theme";
import { spacing, typography } from "../../utils/theme";
import { BIOMETRIC_AUTH_KEY } from "../../constants/auth";

type BiometricUnlockScreenProps = {
  onUnlock: () => void;
  onSignOut: () => void;
  userEmail?: string;
};

export const BiometricUnlockScreen: React.FC<BiometricUnlockScreenProps> = ({
  onUnlock,
  onSignOut,
  userEmail,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("biometric");

  useEffect(() => {
    checkBiometricSupport();
  }, []);

  const checkBiometricSupport = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (compatible) {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("Face ID");
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType("Fingerprint");
      } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        setBiometricType("Iris");
      } else {
        setBiometricType("Device");
      }

      // Auto-trigger authentication on mount
      setTimeout(() => handleBiometricAuth(), 500);
    }
  };

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert("Not Supported", "Your device doesn't support biometric authentication");
        setIsAuthenticating(false);
        return;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        Alert.alert(
          "No Biometrics Enrolled",
          "Please set up biometric authentication in your device settings",
          [{ text: "OK" }]
        );
        setIsAuthenticating(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Oweza",
        fallbackLabel: "Use Passcode",
        disableDeviceFallback: false,
      });

      if (result.success) {
        await AsyncStorage.setItem(BIOMETRIC_AUTH_KEY, "true");
        onUnlock();
      } else {
        setIsAuthenticating(false);
      }
    } catch (error) {
      console.error("Biometric auth error:", error);
      Alert.alert("Authentication Error", "Failed to authenticate. Please try again.");
      setIsAuthenticating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔒</Text>
        </View>

        <Text style={styles.title}>Welcome Back</Text>
        {userEmail && <Text style={styles.email}>{userEmail}</Text>}

        <Text style={styles.subtitle}>
          Unlock your wallet with {biometricType.toLowerCase()}
        </Text>

        {isAuthenticating ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Authenticating...</Text>
          </View>
        ) : (
          <PrimaryButton
            title={`Unlock with ${biometricType}`}
            onPress={handleBiometricAuth}
          />
        )}

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={onSignOut}
        >
          <Text style={styles.signOutText}>Sign in with different account</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Your wallet is secured with device biometrics
        </Text>
      </View>
    </View>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
    },
    iconContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: `${colors.primary}15`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xl,
    },
    icon: {
      fontSize: 48,
    },
    title: {
      ...typography.title,
      fontSize: 32,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      textAlign: "center",
    },
    email: {
      ...typography.body,
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: spacing.md,
      textAlign: "center",
    },
    subtitle: {
      ...typography.body,
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
      textAlign: "center",
      maxWidth: 300,
    },
    loadingContainer: {
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.lg,
    },
    loadingText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    signOutButton: {
      marginTop: spacing.lg,
      padding: spacing.md,
    },
    signOutText: {
      ...typography.body,
      color: colors.primary,
      fontSize: 15,
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      alignItems: "center",
    },
    footerText: {
      ...typography.body,
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
    },
  });

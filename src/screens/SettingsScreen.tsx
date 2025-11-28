import React from "react";
import { ScrollView, View, Text, TouchableOpacity, Alert } from "react-native";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AppKitProvider";
import { spacing, typography } from "../utils/theme";
import type { ColorPalette } from "../utils/theme";
import type { ThemeScheme } from "../providers/ThemeProvider";
import { formatShortAddress } from "../utils/format";

export const SettingsScreen: React.FC<{ profile: any; scheme: ThemeScheme; setScheme: (s: ThemeScheme) => void; copyWalletAddress: () => void; disconnect: () => void; }> = ({ profile, scheme, setScheme, copyWalletAddress, disconnect }) => {
  const theme = useTheme();
  const { colors } = theme;
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.settingsContainer, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.settingsScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionTitle}>Appearance</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Theme</Text>
              <Text style={styles.settingDescription}>Choose your preferred theme</Text>
            </View>
          </View>

          <View style={styles.themeSelector}>
            <TouchableOpacity
              style={[styles.themeOption, scheme === "light" && styles.themeOptionActive]}
              onPress={() => setScheme("light")}
            >
              <Text style={styles.themeOptionIcon}>☀️</Text>
              <Text style={[styles.themeOptionText, scheme === "light" && styles.themeOptionTextActive]}>Light</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeOption, scheme === "dark" && styles.themeOptionActive]}
              onPress={() => setScheme("dark")}
            >
              <Text style={styles.themeOptionIcon}>🌙</Text>
              <Text style={[styles.themeOptionText, scheme === "dark" && styles.themeOptionTextActive]}>Dark</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionTitle}>Account</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Email</Text>
              <Text style={styles.settingDescription}>{profile?.email ?? "Not set"}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.settingRow} onPress={copyWalletAddress} activeOpacity={0.7}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Wallet Address</Text>
              <Text style={styles.settingDescription}>{profile?.walletAddress ? formatShortAddress(profile.walletAddress) : "Not connected"}</Text>
            </View>
            {profile?.walletAddress && <Text style={styles.settingCopy}>📋</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.settingsSection}>
          <TouchableOpacity style={styles.settingRow} onPress={disconnect}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, { color: "#EF4444" }]}>Sign Out</Text>
            </View>
            <Text style={styles.settingArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: ColorPalette) =>
({
  settingsContainer: {
    flex: 1,
    paddingBottom: 90,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  settingsSectionTitle: {
    ...typography.subtitle,
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  settingRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: spacing.md,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    ...typography.subtitle,
    fontWeight: '700' as const,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  settingDescription: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '400' as const,
  },
  settingArrow: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  settingCopy: {
    fontSize: 18,
    color: colors.textSecondary,
    opacity: 0.6,
  },
  themeSelector: {
    flexDirection: 'row' as const,
    // gap is not supported in RN StyleSheet, use marginRight on children if needed
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    // gap is not supported in RN StyleSheet, use marginRight on children if needed
    paddingVertical: spacing.md,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  themeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  themeOptionIcon: {
    fontSize: 20,
  },
  themeOptionText: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.textSecondary,
  },
  themeOptionTextActive: {
    color: colors.primary,
  },
});

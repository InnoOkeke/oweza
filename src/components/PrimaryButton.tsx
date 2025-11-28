import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "../providers/ThemeProvider";
import { ColorPalette } from "../utils/theme";

export type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "accent";
};

export const PrimaryButton: React.FC<PrimaryButtonProps & { style?: any }> = ({
  title,
  onPress,
  disabled,
  loading,
  variant = "primary",
  style,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const palette = variant === "accent" ? styles.accentButton : styles.primaryButton;
  const disabledStyle = variant === "accent" ? styles.accentDisabled : styles.primaryDisabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.buttonBase,
        palette,
        (disabled || loading) && disabledStyle,
        pressed && !disabled && !loading && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.inverseText} /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    buttonBase: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    primaryDisabled: {
      backgroundColor: colors.primaryDisabled,
    },
    accentButton: {
      backgroundColor: colors.accent,
    },
    accentDisabled: {
      backgroundColor: colors.accentDisabled,
    },
    buttonPressed: {
      opacity: 0.85,
    },
    buttonText: {
      color: colors.inverseText,
      fontSize: 16,
      fontWeight: "600",
    },
  });

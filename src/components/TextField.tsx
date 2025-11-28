import React, { useMemo } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { useTheme } from "../providers/ThemeProvider";
import type { ColorPalette } from "../utils/theme";

export type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
};

export const TextField: React.FC<TextFieldProps> = ({ label, error, style, ...rest }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style, error ? styles.inputError : null]}
        placeholderTextColor={colors.textSecondary}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: {
      width: "100%",
      marginBottom: 16,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: 6,
    },
    input: {
      width: "100%",
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      color: colors.textPrimary,
      fontSize: 16,
      backgroundColor: "#1c193518",
    },
    inputError: {
      borderColor: colors.error,
    },
    error: {
      marginTop: 4,
      color: colors.error,
      fontSize: 13,
    },
  });

import React, { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../providers/ThemeProvider";
import type { ColorPalette } from "../utils/theme";

export type AvatarProps = {
  size?: number;
  name?: string | null;
  uri?: string | null;
};

export const Avatar: React.FC<AvatarProps> = ({ size = 48, name, uri }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initials = name
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]} />;
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}> 
      <Text style={styles.initials}>{initials || "?"}</Text>
    </View>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    image: {
      borderWidth: 2,
      borderColor: colors.primary,
    },
    fallback: {
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    initials: {
      color: colors.inverseText,
      fontWeight: "600",
    },
  });

import React, { useEffect, useMemo } from "react";
import { Modal, StyleSheet, Text, View, Animated, Pressable } from "react-native";
import { useTheme } from "../providers/ThemeProvider";
import type { ColorPalette } from "../utils/theme";
import { spacing, typography } from "../utils/theme";

export type ToastType = "success" | "error" | "info";

type ToastModalProps = {
  visible: boolean;
  message: string;
  type: ToastType;
  onDismiss: () => void;
  duration?: number;
};

export const ToastModal: React.FC<ToastModalProps> = ({
  visible,
  message,
  type,
  onDismiss,
  duration = 3000,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const slideAnim = React.useRef(new Animated.Value(-100)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide in and fade in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after duration
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      // Reset animations
      slideAnim.setValue(-100);
      opacityAnim.setValue(0);
    }
  }, [visible, duration]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return "✓";
      case "error":
        return "✕";
      case "info":
        return "ℹ";
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case "success":
        return colors.success;
      case "error":
        return colors.error;
      case "info":
        return colors.primary;
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleDismiss}>
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: getBackgroundColor(),
              transform: [{ translateY: slideAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{getIcon()}</Text>
          </View>
          <Text style={styles.message}>{message}</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      paddingTop: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    container: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      paddingVertical: spacing.lg,
      borderRadius: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
      gap: spacing.md,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    icon: {
      fontSize: 18,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    message: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: "#FFFFFF",
      lineHeight: 20,
    },
  });

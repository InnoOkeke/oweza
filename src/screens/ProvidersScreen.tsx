import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, Image } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useTheme } from "../providers/ThemeProvider";
import { spacing, typography } from "../utils/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Providers">;

const MOCK_PROVIDERS = [
    { id: "moonpay", name: "MoonPay", rate: "1 cUSD = $1.00", best: true },
    { id: "transak", name: "Transak", rate: "1 cUSD = $1.00", best: false },
    { id: "paycrest", name: "Paycrest", rate: "1 cUSD = $1.00", best: false },
];

export const ProvidersScreen: React.FC<Props> = ({ navigation, route }) => {
    const { colors } = useTheme();
    const { amount, method } = route.params;

    const handleSelectProvider = (providerId: string) => {
        // Mock integration - in real app, open SDK
        alert(`Selected ${providerId} for ${amount} via ${method}`);
        navigation.popToTop();
    };

    const renderItem = ({ item }: { item: typeof MOCK_PROVIDERS[0] }) => (
        <TouchableOpacity
            style={[styles.providerCard, item.best && styles.bestProviderCard]}
            onPress={() => handleSelectProvider(item.id)}
        >
            <View style={styles.providerInfo}>
                <Text style={styles.providerName}>{item.name}</Text>
                <Text style={styles.providerRate}>{item.rate}</Text>
            </View>
            {item.best && (
                <View style={styles.bestBadge}>
                    <Text style={styles.bestBadgeText}>Best Rate</Text>
                </View>
            )}
        </TouchableOpacity>
    );

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
            padding: spacing.lg,
        },
        header: {
            marginBottom: spacing.lg,
        },
        title: {
            ...typography.subtitle,
            color: colors.textPrimary,
            fontSize: 20,
            fontWeight: "700",
        },
        subtitle: {
            ...typography.body,
            color: colors.textSecondary,
            marginTop: spacing.xs,
        },
        providerCard: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.cardBackground,
            padding: spacing.lg,
            borderRadius: 16,
            marginBottom: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        bestProviderCard: {
            borderColor: colors.primary,
            backgroundColor: `${colors.primary}10`,
        },
        providerInfo: {
            gap: 4,
        },
        providerName: {
            ...typography.subtitle,
            color: colors.textPrimary,
            fontSize: 16,
            fontWeight: "600",
        },
        providerRate: {
            ...typography.body,
            color: colors.textSecondary,
            fontSize: 14,
        },
        bestBadge: {
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: 12,
        },
        bestBadgeText: {
            color: "#FFFFFF",
            fontSize: 12,
            fontWeight: "600",
        },
    });

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Select Provider</Text>
                <Text style={styles.subtitle}>Best rates for your deposit</Text>
            </View>
            <FlatList
                data={MOCK_PROVIDERS}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
            />
        </SafeAreaView>
    );
};

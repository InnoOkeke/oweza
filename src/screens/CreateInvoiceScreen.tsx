import React, { useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    Platform,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import DateTimePicker from "@react-native-community/datetimepicker";

import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../providers/Web3AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { invoiceService, CreateInvoiceInput } from "../services/InvoiceService";
import type { ColorPalette } from "../utils/theme";
import { spacing, typography } from "../utils/theme";
import { InvoiceItem } from "../types/database";

type Props = NativeStackScreenProps<RootStackParamList, "CreateInvoice">;

type InvoiceItemInput = {
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
};

export const CreateInvoiceScreen: React.FC<Props> = ({ navigation }) => {
    const { profile } = useAuth();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [clientEmail, setClientEmail] = useState("");
    const [clientName, setClientName] = useState("");
    const [items, setItems] = useState<InvoiceItemInput[]>([
        { description: "", quantity: "1", unitPrice: "", amount: "0.00" },
    ]);
    const [taxRate, setTaxRate] = useState("");
    const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [notes, setNotes] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const calculateItemAmount = (quantity: string, unitPrice: string): string => {
        const qty = parseFloat(quantity) || 0;
        const price = parseFloat(unitPrice) || 0;
        return (qty * price).toFixed(2);
    };

    const handleItemChange = (index: number, field: keyof InvoiceItemInput, value: string) => {
        const newItems = [...items];
        newItems[index][field] = value;

        // Auto-calculate amount when quantity or unitPrice changes
        if (field === "quantity" || field === "unitPrice") {
            newItems[index].amount = calculateItemAmount(
                newItems[index].quantity,
                newItems[index].unitPrice
            );
        }

        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, { description: "", quantity: "1", unitPrice: "", amount: "0.00" }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const calculateTotals = () => {
        const invoiceItems: InvoiceItem[] = items.map((item) => ({
            description: item.description,
            quantity: parseFloat(item.quantity) || 0,
            unitPrice: item.unitPrice,
            amount: item.amount,
        }));

        return invoiceService.calculateInvoiceTotals(invoiceItems, taxRate || undefined);
    };

    const totals = calculateTotals();

    const handleSubmit = async () => {
        // Validation
        if (!clientEmail.trim()) {
            Alert.alert("Error", "Please enter client email");
            return;
        }

        if (!clientEmail.includes("@")) {
            Alert.alert("Error", "Please enter a valid email address");
            return;
        }

        const hasValidItem = items.some(
            (item) => item.description.trim() && parseFloat(item.unitPrice) > 0
        );

        if (!hasValidItem) {
            Alert.alert("Error", "Please add at least one item with a description and price");
            return;
        }

        if (!profile) {
            Alert.alert("Error", "Please sign in to create invoices");
            return;
        }

        setIsSubmitting(true);

        try {
            const invoiceItems: InvoiceItem[] = items
                .filter((item) => item.description.trim() && parseFloat(item.unitPrice) > 0)
                .map((item) => ({
                    description: item.description.trim(),
                    quantity: parseFloat(item.quantity) || 1,
                    unitPrice: item.unitPrice,
                    amount: item.amount,
                }));

            const input: CreateInvoiceInput = {
                clientEmail: clientEmail.trim(),
                clientName: clientName.trim() || undefined,
                items: invoiceItems,
                subtotal: totals.subtotal,
                taxRate: taxRate || undefined,
                tax: taxRate ? totals.tax : undefined,
                total: totals.total,
                token: "cUSD",
                chain: "celo",
                dueDate: dueDate.toISOString(),
                notes: notes.trim() || undefined,
            };

            await invoiceService.createInvoice(
                profile.userId,
                profile.email,
                profile.displayName,
                profile.walletAddress,
                input
            );

            Alert.alert("Success", "Invoice created successfully! 🎉", [
                {
                    text: "OK",
                    onPress: () => navigation.goBack(),
                },
            ]);
        } catch (error) {
            console.error("Error creating invoice:", error);
            Alert.alert("Error", error instanceof Error ? error.message : "Failed to create invoice");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Create Invoice</Text>
                <Text style={styles.headerSubtitle}>Fill in the details below to create a new invoice</Text>
            </View>

            {/* Client Information */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Client Information</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Client Email *"
                    placeholderTextColor={colors.textSecondary}
                    value={clientEmail}
                    onChangeText={setClientEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Client Name (Optional)"
                    placeholderTextColor={colors.textSecondary}
                    value={clientName}
                    onChangeText={setClientName}
                />
            </View>

            {/* Invoice Items */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Items</Text>
                    <TouchableOpacity onPress={addItem} style={styles.addButton}>
                        <Text style={styles.addButtonText}>+ Add Item</Text>
                    </TouchableOpacity>
                </View>

                {items.map((item, index) => (
                    <View key={index} style={styles.itemCard}>
                        <View style={styles.itemHeader}>
                            <Text style={styles.itemNumber}>Item {index + 1}</Text>
                            {items.length > 1 && (
                                <TouchableOpacity onPress={() => removeItem(index)}>
                                    <Text style={styles.removeButton}>Remove</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <TextInput
                            style={[styles.input, styles.cardInput]}
                            placeholder="Description *"
                            placeholderTextColor={colors.textSecondary}
                            value={item.description}
                            onChangeText={(value) => handleItemChange(index, "description", value)}
                        />

                        <View style={styles.row}>
                            <TextInput
                                style={[styles.input, styles.inputSmall, styles.cardInput]}
                                placeholder="Qty"
                                placeholderTextColor={colors.textSecondary}
                                value={item.quantity}
                                onChangeText={(value) => handleItemChange(index, "quantity", value)}
                                keyboardType="numeric"
                            />
                            <TextInput
                                style={[styles.input, styles.inputSmall, styles.cardInput]}
                                placeholder="Unit Price"
                                placeholderTextColor={colors.textSecondary}
                                value={item.unitPrice}
                                onChangeText={(value) => handleItemChange(index, "unitPrice", value)}
                                keyboardType="decimal-pad"
                            />
                            <View style={[styles.input, styles.inputSmall, styles.amountDisplay]}>
                                <Text style={styles.amountText}>${item.amount}</Text>
                            </View>
                        </View>
                    </View>
                ))}
            </View>

            {/* Tax & Due Date */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Additional Details</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Tax Rate % (Optional)"
                    placeholderTextColor={colors.textSecondary}
                    value={taxRate}
                    onChangeText={setTaxRate}
                    keyboardType="decimal-pad"
                />

                <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.dateLabel}>Due Date</Text>
                    <Text style={styles.dateValue}>{dueDate.toLocaleDateString()}</Text>
                </TouchableOpacity>

                {showDatePicker && (
                    <DateTimePicker
                        value={dueDate}
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) => {
                            setShowDatePicker(Platform.OS === "ios");
                            if (selectedDate) {
                                setDueDate(selectedDate);
                            }
                        }}
                    />
                )}

                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Notes (Optional)"
                    placeholderTextColor={colors.textSecondary}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                />
            </View>

            {/* Totals */}
            <View style={styles.totalsCard}>
                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Subtotal</Text>
                    <Text style={styles.totalValue}>${totals.subtotal}</Text>
                </View>
                {taxRate && (
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Tax ({taxRate}%)</Text>
                        <Text style={styles.totalValue}>${totals.tax}</Text>
                    </View>
                )}
                <View style={[styles.totalRow, styles.totalRowFinal]}>
                    <Text style={styles.totalLabelFinal}>Total</Text>
                    <Text style={styles.totalValueFinal}>${totals.total} cUSD</Text>
                </View>
            </View>

            <PrimaryButton
                title={isSubmitting ? "Creating..." : "Create Invoice"}
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
            />
        </ScrollView>
    );
};

const createStyles = (colors: ColorPalette) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        scrollContent: {
            padding: spacing.lg,
            paddingBottom: spacing.xl * 2,
        },
        header: {
            marginBottom: spacing.lg,
        },
        headerTitle: {
            ...typography.title,
            color: colors.textPrimary,
            marginBottom: spacing.xs,
        },
        headerSubtitle: {
            ...typography.body,
            color: colors.textSecondary,
        },
        section: {
            marginBottom: spacing.lg,
        },
        sectionHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: spacing.md,
        },
        sectionTitle: {
            ...typography.subtitle,
            color: colors.textPrimary,
            marginBottom: spacing.md,
        },
        input: {
            backgroundColor: colors.cardBackground,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: spacing.md,
            color: colors.textPrimary,
            fontSize: 16,
            marginBottom: spacing.sm,
        },
        cardInput: {
            backgroundColor: colors.background,
        },
        textArea: {
            height: 80,
            textAlignVertical: "top",
        },
        itemCard: {
            backgroundColor: colors.cardBackground,
            borderRadius: 12,
            padding: spacing.md,
            marginBottom: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        itemHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: spacing.sm,
        },
        itemNumber: {
            ...typography.subtitle,
            color: colors.textPrimary,
            fontSize: 14,
            fontWeight: "600",
        },
        removeButton: {
            color: colors.error,
            fontSize: 14,
            fontWeight: "600",
        },
        addButton: {
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            backgroundColor: colors.primary + "20",
            borderRadius: 8,
        },
        addButtonText: {
            color: colors.primary,
            fontSize: 14,
            fontWeight: "600",
        },
        row: {
            flexDirection: "row",
            gap: spacing.sm,
        },
        inputSmall: {
            flex: 1,
        },
        amountDisplay: {
            justifyContent: "center",
            backgroundColor: colors.background,
        },
        amountText: {
            color: colors.textPrimary,
            fontWeight: "600",
        },
        dateButton: {
            backgroundColor: colors.cardBackground,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: spacing.md,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: spacing.sm,
        },
        dateLabel: {
            ...typography.body,
            color: colors.textSecondary,
        },
        dateValue: {
            ...typography.body,
            color: colors.textPrimary,
            fontWeight: "600",
        },
        totalsCard: {
            backgroundColor: colors.cardBackground,
            borderRadius: 12,
            padding: spacing.lg,
            marginBottom: spacing.lg,
            borderWidth: 1,
            borderColor: colors.border,
        },
        totalRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: spacing.sm,
        },
        totalRowFinal: {
            marginTop: spacing.sm,
            paddingTop: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        totalLabel: {
            ...typography.body,
            color: colors.textSecondary,
        },
        totalValue: {
            ...typography.body,
            color: colors.textPrimary,
            fontWeight: "600",
        },
        totalLabelFinal: {
            ...typography.subtitle,
            color: colors.textPrimary,
            fontSize: 18,
            fontWeight: "700",
        },
        totalValueFinal: {
            ...typography.subtitle,
            color: colors.primary,
            fontSize: 18,
            fontWeight: "700",
        },
    });

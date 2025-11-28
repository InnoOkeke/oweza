import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking, Pressable } from 'react-native';
import { useTheme } from '../providers/ThemeProvider';
import { spacing, typography } from '../utils/theme';
import { ActivityItem } from '../hooks/useRecentActivity';
import { formatShortAddress, formatRelativeDate } from '../utils/format';
import { useQuery } from '@tanstack/react-query';
import { clientUserService } from '../services/clientUserService';

interface TransactionDetailsModalProps {
    visible: boolean;
    onClose: () => void;
    transaction: ActivityItem | null;
    userCurrency?: string;
    fxRate?: number;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
    visible,
    onClose,
    transaction,
    userCurrency = 'USD',
    fxRate = 1,
}) => {
    // All hooks must be called before any conditional returns
    const { colors } = useTheme();
    const styles = createStyles(colors);

    // User profile lookup - needs to be called unconditionally
    const { data: senderProfile } = useQuery({
        queryKey: ['user', transaction?.metadata?.from],
        queryFn: async () => {
            if (!transaction?.metadata?.from) return null;
            // Check if it looks like a wallet address
            if (transaction.metadata.from.startsWith('0x')) {
                return clientUserService.findUserByWalletAddress(transaction.metadata.from);
            }
            return null;
        },
        enabled: !!transaction?.metadata?.from && transaction.metadata.from.startsWith('0x'),
    });

    // Early return AFTER all hooks
    if (!transaction) return null;

    const isReceived = transaction.amount > 0;
    const formattedAmount = Math.abs(transaction.amount).toFixed(2);
    const localAmount = (Math.abs(transaction.amount) * fxRate).toFixed(2);
    const showLocal = userCurrency !== transaction.currency;

    // Determine To/From logic for details
    let detailsLabel = '';
    let detailsValue = '';
    if (isReceived) {
        // Received: show From sender
        detailsLabel = 'From';
        detailsValue = transaction.metadata?.from || 'Unknown Sender';
    } else {
        // Sent: show To recipient
        detailsLabel = 'To';
        detailsValue = transaction.metadata?.to || 'Unknown Recipient';
    }

    // For tip, pay, gift, follow same routine
    if (['tip-sent', 'tip-received', 'gift-sent', 'gift-received', 'payment-request-paid', 'payment-request-received'].includes(transaction.type)) {
        if (isReceived) {
            detailsLabel = 'From';
            detailsValue = transaction.metadata?.from || 'Unknown Sender';
        } else {
            detailsLabel = 'To';
            detailsValue = transaction.metadata?.to || 'Unknown Recipient';
        }
    }

    const getIcon = () => {
        switch (transaction.type) {
            case 'gift-sent':
            case 'gift-received':
                return '🎁';
            case 'tip-sent':
            case 'tip-received':
                return '💸';
            case 'payment-request-paid':
            case 'payment-request-received':
                return '📄';
            default:
                return isReceived ? '⬇️' : '↗️';
        }
    };

    const getTitle = () => {
        if (isReceived) {
            return "You've got Funds";
        }
        return "Transfer Complete 🚀";
    };

    const handleOpenExplorer = () => {
        if (transaction.txHash) {
            Linking.openURL(`https://sepolia.basescan.org/tx/${transaction.txHash}`);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <Text style={styles.title}>{getTitle()} {getIcon()}</Text>
                    </View>

                    <View style={styles.amountContainer}>
                        {showLocal ? (
                            <>
                                <Text style={[styles.amount, isReceived ? styles.amountReceived : styles.amountSent]}>
                                    {userCurrency} {localAmount}
                                </Text>
                                <Text style={styles.subAmount}>
                                    {formattedAmount} {transaction.currency}
                                </Text>
                            </>
                        ) : (
                            <Text style={[styles.amount, isReceived ? styles.amountReceived : styles.amountSent]}>
                                {formattedAmount} {transaction.currency}
                            </Text>
                        )}
                        <Text style={styles.date}>{new Date(transaction.timestamp).toLocaleString()}</Text>
                    </View>

                    <View style={styles.detailsContainer}>
                        <Text style={styles.sectionLabel}>{detailsLabel}</Text>
                        <View style={styles.userRow}>
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>
                                    {detailsValue.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                            <Text style={styles.userName}>
                                {detailsValue.startsWith('0x') ? formatShortAddress(detailsValue) : detailsValue}
                            </Text>
                        </View>
                    </View>

                    {transaction.txHash && (
                        <TouchableOpacity style={styles.receiptButton} onPress={handleOpenExplorer}>
                            <Text style={styles.receiptButtonText}>Txn Hash</Text>
                        </TouchableOpacity>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const createStyles = (colors: any) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    content: {
        backgroundColor: '#2C2C2E', // Dark grey background similar to screenshot
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: spacing.lg,
        paddingBottom: spacing.xl,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: spacing.lg,
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    title: {
        ...typography.subtitle,
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    amountContainer: {
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    amount: {
        fontSize: 36,
        fontWeight: '700',
        marginBottom: 4,
    },
    amountReceived: {
        color: '#10B981', // Green
    },
    amountSent: {
        color: '#FFFFFF',
    },
    subAmount: {
        ...typography.body,
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 14,
        marginBottom: 4,
    },
    date: {
        ...typography.caption,
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 12,
    },
    detailsContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: spacing.md,
        marginBottom: spacing.xl,
    },
    sectionLabel: {
        ...typography.caption,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: spacing.sm,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#4A90E2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    userName: {
        ...typography.body,
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '500',
    },
    receiptButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
    receiptButtonText: {
        ...typography.body,
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
});

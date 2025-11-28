import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useTheme } from '../providers/ThemeProvider';
import { spacing, typography } from '../utils/theme';

interface TransactionCardProps {
  title: string;
  subtitle?: string;
  amount?: string | number;
  date?: string;
  status?: string;
  transactionHash?: string;
  explorerUrl?: string; // optional, but we will default to BASE_SEPOLIA
  onPressHash?: () => void;
  onPress?: () => void; // Make entire card clickable
  children?: React.ReactNode;
  // New props for unified card usage across gifts, tips, payments, invoices
  icon?: React.ReactNode; // small icon or avatar to display (used for gifts)
  statusText?: string; // e.g., 'Pending', 'Claimed', 'Paid'
  actions?: Array<{
    label: string;
    onPress?: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
  }>;
}

const BASE_SEPOLIA_EXPLORER = 'https://sepolia.basescan.org';

export const TransactionCard: React.FC<TransactionCardProps> = ({
  title,
  subtitle,
  amount,
  date,
  status,
  transactionHash,
  explorerUrl,
  onPressHash,
  onPress,
  children,
  icon,
  statusText,
  actions,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const txUrl = transactionHash ? `${(explorerUrl || BASE_SEPOLIA_EXPLORER)}/tx/${transactionHash}` : undefined;

  const handlePressHash = async () => {
    if (!transactionHash) return;
    try {
      // copy to clipboard using expo-clipboard if available
      // @ts-ignore: optional dependency may not have types in this workspace
      const Clipboard = await import('expo-clipboard');
      if (Clipboard && Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(transactionHash);
      } else if ((global as any).navigator && (global as any).navigator.clipboard) {
        // web fallback
        await (global as any).navigator.clipboard.writeText(transactionHash);
      }
    } catch (e) {
      // ignore clipboard errors
    }

    // open explorer URL (best-effort)
    if (txUrl) {
      try {
        await Linking.openURL(txUrl);
      } catch (e) {
        // ignore open errors
      }
    }

    if (onPressHash) onPressHash();
  };

  const CardWrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.7 } : {};

  return (
    <CardWrapper style={[styles.card, { backgroundColor: colors.cardBackground }]} {...wrapperProps}>
      <View style={styles.cardContent}>
        <View style={styles.headerRow}>
          {icon ? <View style={styles.iconWrapper}>{icon}</View> : null}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <View style={styles.rightBlock}>
            {amount !== undefined ? <Text style={styles.amount}>{String(amount)}</Text> : null}
            {statusText ? <Text style={[styles.statusBadge, statusText === 'Pending' ? styles.statusPending : styles.statusActive]}>{statusText}</Text> : null}
          </View>
        </View>

        {transactionHash ? (
          <TouchableOpacity onPress={handlePressHash} style={styles.hashButton} activeOpacity={0.8}>
            <Text style={styles.hashText} numberOfLines={1} ellipsizeMode="middle">Tx: {transactionHash}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.childrenRow}>
          {children}
        </View>

        {actions && actions.length ? (
          <View style={styles.actionsRow}>
            {actions.map((a, i) => (
              <TouchableOpacity
                key={i}
                onPress={a.onPress}
                style={[styles.actionButton, a.variant === 'primary' ? styles.actionPrimary : a.variant === 'danger' ? styles.actionDanger : styles.actionSecondary]}
                activeOpacity={0.8}
              >
                <Text style={[styles.actionText, a.variant === 'primary' ? styles.actionTextPrimary : a.variant === 'danger' ? styles.actionTextDanger : styles.actionTextSecondary]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    </CardWrapper>
  );
};

function createStyles(colors: any) {
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      padding: spacing.sm,
      marginBottom: spacing.md,
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.border || '#000',
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 2,
    },
    cardContent: {
      flexDirection: 'column',
      justifyContent: 'center',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    iconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    titleBlock: {
      flex: 1,
      flexDirection: 'column',
    },
    rightBlock: {
      alignItems: 'flex-end',
      marginLeft: 8,
    },
    title: {
      ...typography.subtitle,
      color: colors.textPrimary,
      marginBottom: 4,
      fontSize: 15,
      fontWeight: '600',
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
      marginBottom: 4,
      fontSize: 13,
    },
    amount: {
      ...typography.title,
      color: colors.primary,
      marginBottom: 4,
      fontSize: 15,
      fontWeight: '700',
    },
    status: {
      ...typography.caption,
      color: colors.textSecondary,
      marginBottom: 4,
      fontSize: 11,
    },
    hashButton: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: 'transparent',
      marginTop: 6,
    },
    hashText: {
      ...typography.caption,
      color: colors.primary,
      fontSize: 12,
    },
    childrenRow: {
      marginTop: 8,
    },
    actionsRow: {
      flexDirection: 'row',
      marginTop: 10,
      gap: 8,
    },
    actionButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      minWidth: 72,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionPrimary: {
      backgroundColor: colors.primary,
    },
    actionSecondary: {
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionDanger: {
      backgroundColor: '#FF6B6B',
    },
    actionText: {
      fontSize: 13,
      fontWeight: '600',
    },
    actionTextPrimary: {
      color: '#fff',
    },
    actionTextSecondary: {
      color: colors.textPrimary,
    },
    actionTextDanger: {
      color: '#fff',
    },
    statusBadge: {
      marginTop: 6,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 8,
      fontSize: 11,
      overflow: 'hidden',
    },
    statusPending: {
      backgroundColor: '#FFF3CD',
      color: '#856404',
    },
    statusActive: {
      backgroundColor: '#D4EDDA',
      color: '#155724',
    },
  });
}

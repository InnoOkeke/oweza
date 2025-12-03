import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Dimensions,
    Alert
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../providers/ThemeProvider';
import { spacing, typography } from '../utils/theme';

const { width, height } = Dimensions.get('window');

interface QRScannerProps {
    visible: boolean;
    onClose: () => void;
    onScan: (data: { address: string; email?: string }) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ visible, onClose, onScan }) => {
    const { colors } = useTheme();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);

    useEffect(() => {
        if (visible && !permission?.granted) {
            requestPermission();
        }
    }, [visible]);

    const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
        if (scanned) return;

        setScanned(true);

        try {
            // Try to parse as JSON (new format with address + email)
            const parsedData = JSON.parse(data);
            if (parsedData.address) {
                onScan({
                    address: parsedData.address,
                    email: parsedData.email
                });
                onClose();
            } else {
                throw new Error('Invalid QR code format');
            }
        } catch (error) {
            // Fallback: treat as plain wallet address
            if (data.startsWith('0x') && data.length === 42) {
                onScan({ address: data });
                onClose();
            } else {
                Alert.alert('Invalid QR Code', 'This QR code does not contain valid wallet information.');
                setScanned(false);
            }
        }
    };

    const handleClose = () => {
        setScanned(false);
        onClose();
    };

    if (!permission) {
        return null;
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide" transparent={false}>
                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    <View style={styles.permissionContainer}>
                        <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>
                            Camera Permission Required
                        </Text>
                        <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
                            We need your permission to use the camera to scan QR codes
                        </Text>
                        <TouchableOpacity
                            style={[styles.permissionButton, { backgroundColor: colors.primary }]}
                            onPress={requestPermission}
                        >
                            <Text style={styles.permissionButtonText}>Grant Permission</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={handleClose}
                        >
                            <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                                Cancel
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={styles.container}>
                <CameraView
                    style={styles.camera}
                    facing="back"
                    onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                    barcodeScannerSettings={{
                        barcodeTypes: ['qr'],
                    }}
                >
                    {/* Overlay */}
                    <View style={styles.overlay}>
                        {/* Top */}
                        <View style={styles.overlayTop}>
                            <View style={styles.header}>
                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={handleClose}
                                >
                                    <Text style={styles.closeButtonText}>✕ Close</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.title}>Scan QR Code</Text>
                            <Text style={styles.subtitle}>
                                Align the QR code within the frame to scan
                            </Text>
                        </View>

                        {/* Scanning Frame */}
                        <View style={styles.scannerFrame}>
                            <View style={styles.frameCorners}>
                                <View style={[styles.cornerTopLeft, { borderColor: colors.primary }]} />
                                <View style={[styles.cornerTopRight, { borderColor: colors.primary }]} />
                                <View style={[styles.cornerBottomLeft, { borderColor: colors.primary }]} />
                                <View style={[styles.cornerBottomRight, { borderColor: colors.primary }]} />
                            </View>
                        </View>

                        {/* Bottom */}
                        <View style={styles.overlayBottom}>
                            <Text style={styles.instruction}>
                                📱 Position the QR code inside the frame
                            </Text>
                        </View>
                    </View>
                </CameraView>
            </View>
        </Modal>
    );
};

const FRAME_SIZE = width * 0.7;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    overlayTop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingTop: 60,
        paddingHorizontal: spacing.lg,
    },
    header: {
        marginBottom: spacing.lg,
    },
    closeButton: {
        alignSelf: 'flex-start',
        padding: spacing.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
    },
    closeButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    title: {
        ...typography.title,
        fontSize: 28,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: spacing.xs,
    },
    subtitle: {
        ...typography.body,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    scannerFrame: {
        height: FRAME_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    frameCorners: {
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        position: 'relative',
    },
    cornerTopLeft: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 40,
        height: 40,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderTopLeftRadius: 8,
    },
    cornerTopRight: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 40,
        height: 40,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderTopRightRadius: 8,
    },
    cornerBottomLeft: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: 40,
        height: 40,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderBottomLeftRadius: 8,
    },
    cornerBottomRight: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 40,
        height: 40,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderBottomRightRadius: 8,
    },
    overlayBottom: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
    },
    instruction: {
        ...typography.body,
        fontSize: 16,
        color: '#FFFFFF',
        textAlign: 'center',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    permissionTitle: {
        ...typography.title,
        fontSize: 24,
        fontWeight: '700',
        marginBottom: spacing.md,
        textAlign: 'center',
    },
    permissionText: {
        ...typography.body,
        fontSize: 16,
        textAlign: 'center',
        marginBottom: spacing.xl,
        lineHeight: 24,
    },
    permissionButton: {
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderRadius: 12,
        marginBottom: spacing.md,
    },
    permissionButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelButton: {
        padding: spacing.md,
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
});

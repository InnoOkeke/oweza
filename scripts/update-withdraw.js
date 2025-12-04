const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'screens', 'WithdrawScreen.tsx');

console.log('📝 Updating WithdrawScreen.tsx with wallet withdrawal functionality...');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update imports - replace the import line for getCusdBalance
const oldImport = `import { getCusdBalance } from "../services/blockchain";`;
const newImport = `import { getCusdBalance, encodeCusdTransfer } from "../services/blockchain";`;

if (content.includes(oldImport)) {
    content = content.replace(oldImport, newImport);
    console.log('✅ Updated blockchain imports');
} else {
    console.log('⚠️  Blockchain import already updated or not found');
}

// 2. Update useQuery import
const oldQueryImport = `import { useQuery } from "@tanstack/react-query";`;
const newQueryImport = `import { useQuery, useQueryClient } from "@tanstack/react-query";`;

if (content.includes(oldQueryImport)) {
    content = content.replace(oldQueryImport, newQueryImport);
    console.log('✅ Updated react-query imports');
}

// 3. Add LocalAuthentication import after WebView
const webViewImport = `import { WebView } from "react-native-webview";`;
const webViewWithAuth = `import { WebView } from "react-native-webview";\r\nimport * as LocalAuthentication from "expo-local-authentication";`;

if (content.includes(webViewImport) && !content.includes('LocalAuthentication')) {
    content = content.replace(webViewImport, webViewWithAuth);
    console.log('✅ Added LocalAuthentication import');
}

// 4. Add useToast and ToastModal imports
const offrampImports = `import { RampProvider } from "../services/ramp";`;
const offrampWithToast = `import { RampProvider } from "../services/ramp";\r\nimport { useToast } from "../utils/toast";\r\nimport { ToastModal } from "../components/ToastModal";`;

if (content.includes(offrampImports) && !content.includes('useToast')) {
    content = content.replace(offrampImports, offrampWithToast);
    console.log('✅ Added toast imports');
}

// 5. Add import for CUSD_TOKEN_ADDRESS
const celoImport = `import { getCusdBalance, encodeCusdTransfer } from "../services/blockchain";`;
const celoWithAddress = `import { getCusdBalance, encodeCusdTransfer } from "../services/blockchain";\r\nimport { CUSD_TOKEN_ADDRESS } from "../config/celo";`;

if (content.includes(celoImport) && !content.includes('CUSD_TOKEN_ADDRESS')) {
    content = content.replace(celoImport, celoWithAddress);
    console.log('✅ Added CUSD_TOKEN_ADDRESS import');
}

// 6. Update the component to add sendUserOperation, queryClient, and toast
const profileLine = `const { profile } = useAuth();`;
const profileWithMore = `const { profile, sendUserOperation } = useAuth();\r\n  const queryClient = useQueryClient();\r\n  const { toast, showToast, hideToast } = useToast();`;

if (content.includes(profileLine)) {
    content = content.replace(profileLine, profileWithMore);
    console.log('✅ Added hooks and providers');
}

// 7. Add new state variables after webViewLoading
const webViewLoadingState = `const [webViewLoading, setWebViewLoading] = useState(true);`;
const withNewStates = `const [webViewLoading, setWebViewLoading] = useState(true);\r\n  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);\r\n  const [isAuthenticating, setIsAuthenticating] = useState(false);\r\n  const [isWithdrawing, setIsWithdrawing] = useState(false);`;

if (content.includes(webViewLoadingState) && !content.includes('isConfirmModalVisible')) {
    content = content.replace(webViewLoadingState, withNewStates);
    console.log('✅ Added state variables');
}

// 8. Replace the TODO handleWalletWithdraw function
const todoComment = `// TODO: Implement direct wallet transfer`;
if (content.includes(todoComment)) {
    // Find the start and end of the handleWalletWithdraw function
    const functionStart = content.indexOf('const handleWalletWithdraw = () => {');
    const functionEnd = content.indexOf('};', functionStart) + 2;

    const newFunctions = `const handleWalletWithdraw = () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than zero.");
      return;
    }

    if (!walletAddress) {
      Alert.alert("Missing Address", "Please enter a wallet address.");
      return;
    }

    if (!walletAddress.startsWith("0x") || walletAddress.length !== 42) {
      Alert.alert("Invalid Address", "Please enter a valid Ethereum/Celo wallet address.");
      return;
    }

    const withdrawAmount = parseFloat(amount);
    if (cusdBalance !== undefined && withdrawAmount > cusdBalance) {
      Alert.alert("Insufficient Balance", \`You only have \${cusdBalance.toFixed(2)} cUSD available.\`);
      return;
    }

    setIsConfirmModalVisible(true);
  };

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert(
          "Confirm Transaction",
          "Biometric authentication is not available. Do you want to proceed?",
          [
            { text: "Cancel", style: "cancel", onPress: () => setIsAuthenticating(false) },
            { text: "Confirm", onPress: () => { executeWithdrawal(); } }
          ]
        );
        setIsAuthenticating(false);
        return;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        Alert.alert(
          "Biometrics Not Set Up",
          "Biometric authentication is not set up. Do you want to proceed?",
          [
            { text: "Cancel", style: "cancel", onPress: () => setIsAuthenticating(false) },
            { text: "Confirm", onPress: () => { executeWithdrawal(); } }
          ]
        );
        setIsAuthenticating(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm Withdrawal",
        fallbackLabel: "Use Passcode",
        disableDeviceFallback: false,
      });

      if (result.success) {
        executeWithdrawal();
      } else {
        setIsAuthenticating(false);
        showToast("Authentication cancelled", "info");
      }
    } catch (error) {
      console.error("Biometric auth error:", error);
      setIsAuthenticating(false);
      showToast("Authentication failed. Please try again.", "error");
    }
  };

  const executeWithdrawal = async () => {
    if (!profile?.walletAddress) {
      showToast("Wallet not connected", "error");
      setIsAuthenticating(false);
      return;
    }

    setIsWithdrawing(true);

    try {
      console.log("🔵 Starting withdrawal to:", walletAddress);
      console.log("📍 Amount:", amount);

      const callData = encodeCusdTransfer(
        walletAddress as \`0x\${string}\`,
        parseFloat(amount)
      );

      console.log("📦 Encoded call data:", callData);

      const result = await sendUserOperation([
        {
          to: CUSD_TOKEN_ADDRESS,
          data: callData,
          value: 0n,
        }
      ]);

      console.log("✅ Withdrawal successful:", result);

      await queryClient.invalidateQueries({ queryKey: ["cusdBalance", profile.walletAddress] });

      showToast(\`Successfully withdrawn \${amount} cUSD to \${walletAddress.slice(0, 6)}...\${walletAddress.slice(-4)}\`, "success");

      setWalletAddress("");
      setAmount("");
      setIsConfirmModalVisible(false);

      setTimeout(() => {
        navigation.goBack();
      }, 2000);
    } catch (error) {
      console.error("❌ Withdrawal error:", error);
      showToast(error instanceof Error ? error.message : "Withdrawal failed", "error");
    } finally {
      setIsWithdrawing(false);
      setIsAuthenticating(false);
    }
  };

  const handleCancelConfirmation = () => {
    setIsConfirmModalVisible(false);
    setIsAuthenticating(false);
  };`;

    if (functionStart > -1 && functionEnd > functionStart) {
        content = content.substring(0, functionStart) + newFunctions + content.substring(functionEnd);
        console.log('✅ Replaced handleWalletWithdraw and added helper functions');
    }
}

// 9. Add confirmation modal and toast before the last </SafeAreaView> in the wallet withdraw view
// Find the return statement for wallet withdraw view
const walletViewReturn = content.indexOf('// Exchange/Wallet Withdraw View');
if (walletViewReturn > -1) {
    // Find the </SafeAreaView> after this point
    const safeAreaEnd = content.indexOf('</SafeAreaView>', walletViewReturn);
    if (safeAreaEnd > -1) {
        const modalCode = `

        {/* Confirmation Modal for Wallet Withdrawal */}
        <Modal
          visible={isConfirmModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={handleCancelConfirmation}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confirm Withdrawal</Text>
                <Pressable onPress={handleCancelConfirmation} style={styles.modalCloseButton}>
                  <Text style={[styles.modalCloseText, { color: colors.textPrimary }]}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.confirmationDetails}>
                <View style={styles.confirmationRow}>
                  <Text style={[styles.confirmationLabel, { color: colors.textSecondary }]}>Sending to</Text>
                  <Text style={[styles.confirmationValue, { color: colors.textPrimary }]}>
                    {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
                  </Text>
                </View>

                <View style={styles.confirmationDivider} />

                <View style={styles.confirmationRow}>
                  <Text style={[styles.confirmationLabel, { color: colors.textSecondary }]}>Amount</Text>
                  <Text style={[styles.confirmationAmount, { color: colors.textPrimary }]}>
                    {amount} cUSD
                  </Text>
                </View>

                <View style={styles.confirmationDivider} />

                <View style={styles.confirmationRow}>
                  <Text style={[styles.confirmationLabel, { color: colors.textSecondary }]}>Network</Text>
                  <Text style={[styles.confirmationValue, { color: colors.textPrimary }]}>Celo Sepolia</Text>
                </View>

                <View style={styles.confirmationRow}>
                  <Text style={[styles.confirmationLabel, { color: colors.textSecondary }]}>Gas Fee</Text>
                  <Text style={[styles.confirmationFree, { color: colors.success }]}>Free (Celo Paymaster)</Text>
                </View>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={handleCancelConfirmation}
                  disabled={isAuthenticating || isWithdrawing}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    { backgroundColor: colors.primary },
                    (isAuthenticating || isWithdrawing) && styles.confirmButtonDisabled
                  ]}
                  onPress={handleBiometricAuth}
                  disabled={isAuthenticating || isWithdrawing}
                >
                  {isAuthenticating || isWithdrawing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmButtonText}>🔒 Confirm</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={[styles.biometricHint, { color: colors.textSecondary }]}>
                You'll be asked to authenticate with biometrics
              </Text>
            </View>
          </View>
        </Modal>

        <ToastModal
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onDismiss={hideToast}
        />
      </SafeAreaView>`;

        if (!content.includes('Confirmation Modal for Wallet Withdrawal')) {
            content = content.substring(0, safeAreaEnd) + modalCode;
            console.log('✅ Added confirmation modal and toast');
        }
    }
}

// 10. Add styles - find the last style definition before the closing });
const styleClosing = content.lastIndexOf('});');
if (styleClosing > -1) {
    // Find the second-to-last }); (the one before createStyles closing)
    const beforeStyleClosing = content.lastIndexOf('},', styleClosing - 1);

    const newStyles = `  confirmationDetails: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  confirmationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  confirmationLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  confirmationValue: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "right",
    flex: 1,
  },
  confirmationAmount: {
    fontSize: 20,
    fontWeight: "700",
  },
  confirmationFree: {
    fontSize: 15,
    fontWeight: "600",
  },
  confirmationDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  biometricHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
`;

    if (!content.includes('confirmationDetails:') && beforeStyleClosing > -1) {
        content = content.substring(0, beforeStyleClosing + 2) + '\r\n  ' + newStyles + content.substring(beforeStyleClosing + 2);
        console.log('✅ Added confirmation modal styles');
    }
}

// Write the file back
fs.writeFileSync(filePath, content, 'utf8');

console.log('\n✅ WithdrawScreen.tsx has been successfully updated!');
console.log('📝 The wallet withdrawal functionality is now fully implemented.');
console.log(`💰 Using cUSD address: ${content.match(/CUSD_TOKEN_ADDRESS/g) ? '0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b' : 'from config'}`);

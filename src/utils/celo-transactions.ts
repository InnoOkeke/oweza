import { createWalletClient, createPublicClient, http, parseEther, Address } from 'viem';
import { celoSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { CUSD_TOKEN_ADDRESS } from '../config/celo';

/**
 * Send a gasless transaction on Celo using cUSD to pay for gas
 * @param privateKey - The user's private key from Web3Auth
 * @param to - Recipient address
 * @param data - Transaction data (encoded function call)
 * @param value - ETH value to send (optional)
 * @returns Transaction hash
 */
export async function sendGaslessTransaction(
    privateKey: `0x${string}`,
    to: Address,
    data?: `0x${string}`,
    value?: bigint
): Promise<`0x${string}`> {
    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
        account,
        chain: celoSepolia,
        transport: http(),
    });

    // Send transaction with feeCurrency (pay gas in cUSD instead of CELO!)
    const hash = await walletClient.sendTransaction({
        to,
        data,
        value: value || 0n,
        // @ts-ignore - feeCurrency is Celo-specific extension
        feeCurrency: CUSD_TOKEN_ADDRESS,
    });

    return hash;
}

/**
 * Wait for a transaction to be confirmed
 * @param hash - Transaction hash
 * @returns Transaction receipt
 */
export async function waitForTransaction(hash: `0x${string}`) {
    const publicClient = createPublicClient({
        chain: celoSepolia,
        transport: http(),
    });

    return await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Get the balance of an address in cUSD
 * @param address - Address to check
 * @returns Balance in cUSD (as bigint)
 */
export async function getCUSDBalance(address: Address): Promise<bigint> {
    const publicClient = createPublicClient({
        chain: celoSepolia,
        transport: http(),
    });

    // Get ERC-20 balance
    const balance = await publicClient.readContract({
        address: CUSD_TOKEN_ADDRESS as Address,
        abi: [{
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
        }],
        functionName: 'balanceOf',
        args: [address],
    });

    return balance as bigint;
}

/**
 * Format cUSD amount for display
 * @param amount - Amount in wei (bigint)
 * @returns Formatted string (e.g., "10.50 cUSD")
 */
export function formatCUSD(amount: bigint): string {
    const formatted = Number(amount) / 1e18;
    return `${formatted.toFixed(2)} cUSD`;
}

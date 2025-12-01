/**
 * Real blockchain operations for Celo Sepolia
 * Uses viem for reading blockchain state
 */

import { createPublicClient, http, encodeFunctionData, parseUnits } from "viem";
import { celoSepolia } from "viem/chains";
import { CUSD_TOKEN_ADDRESS, CUSD_DECIMALS, CELO_RPC_URL } from "../config/celo";

// ERC-20 ABI (minimal - just what we need)
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
    // Celo cUSD Transfer event might be standard ERC20, but sometimes indexed params differ.
    // Standard ERC20 Transfer: event Transfer(address indexed from, address indexed to, uint256 value);
    // Celo's cUSD is ERC20 compliant.
  },
] as const;

export type BlockchainTransaction = {
  hash: string;
  from: string;
  to: string;
  value: number; // in cUSD
  timestamp: number;
  blockNumber: bigint;
  type: "sent" | "received";
};

// Create public client for reading blockchain state
const publicClient = createPublicClient({
  chain: celoSepolia,
  transport: http(CELO_RPC_URL),
});

/**
 * Get cUSD balance for an address
 * @param address Wallet address to check
 * @returns Balance in cUSD (as decimal number, e.g., 10.50)
 */
export async function getCusdBalance(address: `0x${string}`): Promise<number> {
  try {
    const balance = await publicClient.readContract({
      address: CUSD_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    // Convert from smallest unit to cUSD (divide by 10^18)
    const balanceInCusd = Number(balance) / Math.pow(10, CUSD_DECIMALS);
    return balanceInCusd;
  } catch (error) {
    console.error("Failed to fetch cUSD balance:", error);
    throw new Error("Failed to fetch balance from blockchain");
  }
}

/**
 * Encode a cUSD transfer call for use in a user operation
 * @param to Recipient address
 * @param amountCusd Amount in cUSD (e.g., 10.50)
 * @returns Encoded call data
 */
export function encodeCusdTransfer(
  to: `0x${string}`,
  amountCusd: number
): `0x${string}` {
  // Convert cUSD to smallest unit (multiply by 10^18)
  const amountInSmallestUnit = parseUnits(amountCusd.toString(), CUSD_DECIMALS);

  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, amountInSmallestUnit],
  });
}

/**
 * Get CELO balance for an address (needed for gas if not using paymaster, but we use feeCurrency)
 */
export async function getCeloBalance(address: `0x${string}`): Promise<string> {
  try {
    const balance = await publicClient.getBalance({ address });
    return (Number(balance) / 1e18).toFixed(6);
  } catch (error) {
    console.error("Failed to fetch CELO balance:", error);
    return "0";
  }
}

/**
 * Get cUSD transaction history for an address
 * Fetches Transfer events from the cUSD contract
 * @param address Wallet address
 * @param limit Maximum number of transactions to return
 * @returns Array of blockchain transactions
 */
export async function getCusdTransactions(
  address: `0x${string}`,
  limit: number = 50
): Promise<BlockchainTransaction[]> {
  try {
    console.log('🔍 [blockchain] Fetching cUSD transactions for:', address);
    const currentBlock = await publicClient.getBlockNumber();

    // Fetch last ~10000 blocks (approximately 1 day on Celo)
    // Celo block time is ~5s. 1 day = 86400/5 = 17280 blocks.
    const fromBlock = currentBlock - 17280n;

    // Get sent transactions (from address)
    const sentLogs = await publicClient.getLogs({
      address: CUSD_TOKEN_ADDRESS,
      event: ERC20_ABI[2], // Transfer event
      args: {
        from: address,
      },
      fromBlock,
      toBlock: currentBlock,
    });

    // Get received transactions (to address)
    const receivedLogs = await publicClient.getLogs({
      address: CUSD_TOKEN_ADDRESS,
      event: ERC20_ABI[2], // Transfer event
      args: {
        to: address,
      },
      fromBlock,
      toBlock: currentBlock,
    });

    // Process sent transactions
    const sentTxs: BlockchainTransaction[] = await Promise.all(
      sentLogs.map(async (log) => {
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
        return {
          hash: log.transactionHash,
          from: log.args.from!,
          to: log.args.to!,
          value: Number(log.args.value!) / Math.pow(10, CUSD_DECIMALS),
          timestamp: Number(block.timestamp) * 1000,
          blockNumber: log.blockNumber,
          type: "sent" as const,
        };
      })
    );

    // Process received transactions
    const receivedTxs: BlockchainTransaction[] = await Promise.all(
      receivedLogs.map(async (log) => {
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
        return {
          hash: log.transactionHash,
          from: log.args.from!,
          to: log.args.to!,
          value: Number(log.args.value!) / Math.pow(10, CUSD_DECIMALS),
          timestamp: Number(block.timestamp) * 1000,
          blockNumber: log.blockNumber,
          type: "received" as const,
        };
      })
    );

    // Combine and sort by timestamp (newest first)
    const allTxs = [...sentTxs, ...receivedTxs]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return allTxs;
  } catch (error) {
    console.error("Failed to fetch cUSD transactions:", error);
    return [];
  }
}

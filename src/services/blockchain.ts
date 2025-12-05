/**
 * Real blockchain operations for Celo Mainnet
 * Uses viem for reading blockchain state
 */

import { createPublicClient, http, encodeFunctionData, parseUnits } from "viem";
import { celo } from "viem/chains";
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
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "remaining", type: "uint256" }],
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
  chain: celo,
  transport: http(CELO_RPC_URL),
  batch: {
    multicall: true,
  },
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
 * Get cUSD allowance for a spender
 */
export async function getCusdAllowance(owner: `0x${string}`, spender: `0x${string}`): Promise<number> {
  try {
    const allowance = await publicClient.readContract({
      address: CUSD_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    });

    return Number(allowance) / Math.pow(10, CUSD_DECIMALS);
  } catch (error) {
    console.error("Failed to fetch cUSD allowance:", error);
    return 0;
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
 * Encode a cUSD approve call
 */
export function encodeCusdApprove(
  spender: `0x${string}`,
  amountCusd: number
): `0x${string}` {
  const amountInSmallestUnit = parseUnits(amountCusd.toString(), CUSD_DECIMALS);

  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amountInSmallestUnit],
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
    const currentBlock = await publicClient.getBlockNumber();

    // Fetch last ~500000 blocks (approximately 30 days on Celo)
    // Celo block time is ~5s. 1 day = 86400/5 = 17280 blocks.
    // 30 days = 17280 * 30 = 518,400 blocks
    const blocksToFetch = 500000n;
    const fromBlock = currentBlock > blocksToFetch ? currentBlock - blocksToFetch : 0n;

    // Get sent transactions (from address)
    const sentLogs = await publicClient.getLogs({
      address: CUSD_TOKEN_ADDRESS,
      event: ERC20_ABI[4], // Transfer event is now at index 4
      args: {
        from: address,
      },
      fromBlock,
      toBlock: currentBlock,
    });

    // Get received transactions (to address)
    const receivedLogs = await publicClient.getLogs({
      address: CUSD_TOKEN_ADDRESS,
      event: ERC20_ABI[4], // Transfer event is now at index 4
      args: {
        to: address,
      },
      fromBlock,
      toBlock: currentBlock,
    });

    // Group sent logs by transaction hash to handle feeCurrency transactions
    // (one tx can have multiple Transfer events - main transfer + gas fee payment)
    const sentLogsByHash = new Map<string, typeof sentLogs>();
    sentLogs.forEach((log) => {
      const existing = sentLogsByHash.get(log.transactionHash) || [];
      existing.push(log);
      sentLogsByHash.set(log.transactionHash, existing);
    });

    // For each transaction, find the MAIN transfer (largest value, not gas fee)
    const mainSentLogs: typeof sentLogs = [];
    sentLogsByHash.forEach((logs, _hash) => {
      if (logs.length === 1) {
        mainSentLogs.push(logs[0]);
      } else {
        // Multiple transfers in one tx - pick the one with largest value
        // This filters out small gas fee payments
        const mainLog = logs.reduce((best, current) => {
          const bestValue = best.args.value || 0n;
          const currentValue = current.args.value || 0n;
          return currentValue > bestValue ? current : best;
        });
        mainSentLogs.push(mainLog);
      }
    });

    // Same for received logs
    const receivedLogsByHash = new Map<string, typeof receivedLogs>();
    receivedLogs.forEach((log) => {
      const existing = receivedLogsByHash.get(log.transactionHash) || [];
      existing.push(log);
      receivedLogsByHash.set(log.transactionHash, existing);
    });

    const mainReceivedLogs: typeof receivedLogs = [];
    receivedLogsByHash.forEach((logs) => {
      if (logs.length === 1) {
        mainReceivedLogs.push(logs[0]);
      } else {
        const mainLog = logs.reduce((best, current) => {
          const bestValue = best.args.value || 0n;
          const currentValue = current.args.value || 0n;
          return currentValue > bestValue ? current : best;
        });
        mainReceivedLogs.push(mainLog);
      }
    });

    // Process sent transactions (now filtered to main transfers only)
    const sentTxs: BlockchainTransaction[] = await Promise.all(
      mainSentLogs.map(async (log) => {
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

    // Process received transactions (now filtered to main transfers only)
    const receivedTxs: BlockchainTransaction[] = await Promise.all(
      mainReceivedLogs.map(async (log) => {
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

    // Combine and deduplicate by hash
    // Priority: sentTxs take precedence over receivedTxs for the same hash
    const allTxsMap = new Map<string, BlockchainTransaction>();

    // Add received transactions first
    receivedTxs.forEach(tx => {
      allTxsMap.set(tx.hash, tx);
    });

    // Add sent transactions (will overwrite received if same hash)
    sentTxs.forEach(tx => {
      allTxsMap.set(tx.hash, tx);
    });

    const allTxs = Array.from(allTxsMap.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);


    // Clean summary log like transfers
    const shortAddr = address.substring(0, 6);
    console.log(`📋 Synced ${allTxs.length} blockchain transactions (${sentTxs.length} sent, ${receivedTxs.length} received) for ${shortAddr}`);

    return allTxs;
  } catch (error) {
    console.error("❌ Failed to fetch cUSD transactions:", error);
    return [];
  }
}

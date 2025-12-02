/**
 * Check recent cUSD transactions for a wallet
 * Pass wallet address as argument
 */

import * as dotenv from 'dotenv';
import { createPublicClient, http, formatUnits } from 'viem';
import { celoSepolia } from 'viem/chains';

dotenv.config();

const CUSD_TOKEN_ADDRESS = (process.env.CUSD_TOKEN_ADDRESS as `0x${string}`) || '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1';
const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
const RPC_URL = process.env.CELO_RPC_URL || 'https://alfajores-forno.celo-testnet.org';

const ERC20_ABI = [
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'from', type: 'address' },
            { indexed: true, name: 'to', type: 'address' },
            { indexed: false, name: 'value', type: 'uint256' },
        ],
        name: 'Transfer',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'owner', type: 'address' },
            { indexed: true, name: 'spender', type: 'address' },
            { indexed: false, name: 'value', type: 'uint256' },
        ],
        name: 'Approval',
        type: 'event',
    },
] as const;

async function main() {
    const walletAddress = process.argv[2] as `0x${string}`;

    if (!walletAddress || !walletAddress.startsWith('0x')) {
        console.error('❌ Please provide a wallet address as argument');
        console.log('Usage: npx tsx scripts/check-wallet-transactions.ts 0xYourWalletAddress');
        process.exit(1);
    }

    console.log('🔍 Checking recent transactions for:', walletAddress);
    console.log('💵 cUSD Token:', CUSD_TOKEN_ADDRESS);
    if (ESCROW_CONTRACT_ADDRESS) {
        console.log('📦 Escrow Contract:', ESCROW_CONTRACT_ADDRESS);
    }
    console.log('');

    const publicClient = createPublicClient({
        chain: celoSepolia,
        transport: http(RPC_URL),
    });

    try {
        const currentBlock = await publicClient.getBlockNumber();
        const blocksToFetch = 50000n; // Last ~3 days
        const fromBlock = currentBlock > blocksToFetch ? currentBlock - blocksToFetch : 0n;

        console.log(`📊 Fetching transactions from block ${fromBlock} to ${currentBlock}...`);
        console.log('');

        // Get sent transactions
        const sentLogs = await publicClient.getLogs({
            address: CUSD_TOKEN_ADDRESS,
            event: ERC20_ABI[0], // Transfer event
            args: {
                from: walletAddress,
            },
            fromBlock,
            toBlock: currentBlock,
        });

        // Get received transactions
        const receivedLogs = await publicClient.getLogs({
            address: CUSD_TOKEN_ADDRESS,
            event: ERC20_ABI[0],
            args: {
                to: walletAddress,
            },
            fromBlock,
            toBlock: currentBlock,
        });

        // Get approvals
        const approvalLogs = await publicClient.getLogs({
            address: CUSD_TOKEN_ADDRESS,
            event: ERC20_ABI[1], // Approval event
            args: {
                owner: walletAddress,
            },
            fromBlock,
            toBlock: currentBlock,
        });

        console.log(`📤 Sent Transactions: ${sentLogs.length}`);
        console.log(`📥 Received Transactions: ${receivedLogs.length}`);
        console.log(`✓ Approvals: ${approvalLogs.length}`);
        console.log('');

        if (sentLogs.length > 0) {
            console.log('📤 SENT TRANSACTIONS:');
            console.log('═'.repeat(80));
            for (const log of sentLogs) {
                const amount = formatUnits(log.args.value!, 18);
                const to = log.args.to;
                const isEscrow = ESCROW_CONTRACT_ADDRESS && to?.toLowerCase() === ESCROW_CONTRACT_ADDRESS.toLowerCase();

                console.log(`  Amount: ${Number(amount).toFixed(4)} cUSD`);
                console.log(`  To: ${to}${isEscrow ? ' (ESCROW CONTRACT 📦)' : ''}`);
                console.log(`  Tx Hash: ${log.transactionHash}`);
                console.log(`  Block: ${log.blockNumber}`);
                console.log(`  Explorer: https://sepolia.celoscan.io/tx/${log.transactionHash}`);
                console.log('');
            }
        }

        if (approvalLogs.length > 0) {
            console.log('� APPROVALS:');
            console.log('═'.repeat(80));
            for (const log of approvalLogs) {
                const amount = formatUnits(log.args.value!, 18);
                const spender = log.args.spender;
                const isEscrow = ESCROW_CONTRACT_ADDRESS && spender?.toLowerCase() === ESCROW_CONTRACT_ADDRESS.toLowerCase();

                console.log(`  Amount: ${Number(amount).toFixed(4)} cUSD`);
                console.log(`  Spender: ${spender}${isEscrow ? ' (ESCROW CONTRACT 📦)' : ''}`);
                console.log(`  Tx Hash: ${log.transactionHash}`);
                console.log(`  Block: ${log.blockNumber}`);
                console.log('');
            }
        }

        if (receivedLogs.length > 0) {
            console.log('📥 RECEIVED TRANSACTIONS:');
            console.log('═'.repeat(80));
            for (const log of receivedLogs) {
                const amount = formatUnits(log.args.value!, 18);
                const from = log.args.from;
                const isEscrow = ESCROW_CONTRACT_ADDRESS && from?.toLowerCase() === ESCROW_CONTRACT_ADDRESS.toLowerCase();

                console.log(`  Amount: ${Number(amount).toFixed(4)} cUSD`);
                console.log(`  From: ${from}${isEscrow ? ' (ESCROW CONTRACT 📦)' : ''}`);
                console.log(`  Tx Hash: ${log.transactionHash}`);
                console.log(`  Block: ${log.blockNumber}`);
                console.log(`  Explorer: https://sepolia.celoscan.io/tx/${log.transactionHash}`);
                console.log('');
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

main();

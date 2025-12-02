/**
 * Check escrow contract balance and pending transfers
 * This script helps you see what funds are locked in the escrow contract
 */

import * as dotenv from 'dotenv';
import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { celoSepolia } from 'viem/chains';

dotenv.config();

const ESCROW_CONTRACT_ADDRESS = '0x3d5887bcd5953af75d1f27fc5599dd99f1b6384c';
const CUSD_TOKEN_ADDRESS = '0xdE9e4C3ce781b4ba68120d6261cbad65ce0ab00b'; // Celo Sepolia cUSD
const RPC_URL = process.env.CELO_RPC_URL || '';

// ERC20 ABI (minimal)
const ERC20_ABI = [
    {
        constant: true,
        inputs: [{ name: '_owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: 'balance', type: 'uint256' }],
        type: 'function',
    },
] as const;

// Escrow Contract ABI (minimal - just what we need)
const ESCROW_ABI = [
    {
        inputs: [{ name: 'recipientHash', type: 'bytes32' }],
        name: 'getTransfer',
        outputs: [
            { name: 'sender', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'claimed', type: 'bool' },
            { name: 'refunded', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getAllTransferHashes',
        outputs: [{ name: '', type: 'bytes32[]' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

async function main() {
    if (!ESCROW_CONTRACT_ADDRESS) {
        console.error('❌ ESCROW_CONTRACT_ADDRESS not set in .env file');
        process.exit(1);
    }

    console.log('🔍 Checking Escrow Contract:', ESCROW_CONTRACT_ADDRESS);
    console.log('💵 cUSD Token:', CUSD_TOKEN_ADDRESS);
    console.log('');

    const publicClient = createPublicClient({
        chain: celoSepolia,
        transport: http(RPC_URL),
    });

    try {
        // 1. Check cUSD balance of escrow contract
        const balance = await publicClient.readContract({
            address: CUSD_TOKEN_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [ESCROW_CONTRACT_ADDRESS],
        });

        const balanceInCusd = Number(formatUnits(balance, 18));
        console.log(`💰 Escrow Contract cUSD Balance: ${balanceInCusd.toFixed(4)} cUSD`);
        console.log('');

        if (balanceInCusd === 0) {
            console.log('✅ No funds locked in escrow');
            return;
        }

        // 2. Try to get all transfer hashes (if contract has this function)
        try {
            console.log('📋 Attempting to fetch all pending transfers...');
            const transferHashes = await publicClient.readContract({
                address: ESCROW_CONTRACT_ADDRESS,
                abi: ESCROW_ABI,
                functionName: 'getAllTransferHashes',
            });

            console.log(`Found ${transferHashes.length} transfer(s) in escrow`);
            console.log('');

            // Get details for each transfer
            for (let i = 0; i < transferHashes.length; i++) {
                const hash = transferHashes[i];
                try {
                    const transfer = await publicClient.readContract({
                        address: ESCROW_CONTRACT_ADDRESS,
                        abi: ESCROW_ABI,
                        functionName: 'getTransfer',
                        args: [hash],
                    });

                    const [sender, amount, claimed, refunded] = transfer;
                    const amountInCusd = Number(formatUnits(amount, 18));

                    console.log(`Transfer #${i + 1}:`);
                    console.log(`  Hash: ${hash}`);
                    console.log(`  Sender: ${sender}`);
                    console.log(`  Amount: ${amountInCusd.toFixed(4)} cUSD`);
                    console.log(`  Claimed: ${claimed ? '✅' : '❌'}`);
                    console.log(`  Refunded: ${refunded ? '✅' : '❌'}`);
                    console.log(`  Status: ${claimed ? 'Claimed' : refunded ? 'Refunded' : '⏳ Pending'}`);
                    console.log('');
                } catch (error) {
                    console.log(`  ⚠️ Could not get details for transfer hash: ${hash}`);
                }
            }
        } catch (error) {
            console.log('ℹ️ Could not enumerate transfers (contract may not support getAllTransferHashes)');
            console.log('');
            console.log('💡 Your funds are in the escrow contract. To retrieve them:');
            console.log('   1. Go to Transaction History in the app');
            console.log('   2. Find your pending transfer');
            console.log('   3. Tap on it and click "Cancel Transfer & Get Refund"');
        }

        console.log('');
        console.log('📍 View on Explorer:');
        console.log(`   https://sepolia.celoscan.io/address/${ESCROW_CONTRACT_ADDRESS}`);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

main();

import { createPublicClient, http, type Address, type Chain } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
// import { ENTRYPOINT_ADDRESS_V07 } from 'permissionless/v07';
const ENTRYPOINT_ADDRESS_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address;
import { createSmartAccountClient } from 'permissionless/clients';
import { toSimpleSmartAccount } from 'permissionless/accounts';

// Coinbase Paymaster configuration
const COINBASE_PAYMASTER_URL = process.env.PAYMASTER_URL || 'https://api.developer.coinbase.com/rpc/v1/base-sepolia/';

// Simple Account Factory address for Base Sepolia
// This is the standard SimpleAccountFactory
const SIMPLE_ACCOUNT_FACTORY_ADDRESS = '0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985' as Address;

export class SmartWalletService {
    private chain: Chain = baseSepolia;
    private publicClient;
    private bundlerUrl: string;

    constructor(paymasterApiKey?: string) {
        this.bundlerUrl = paymasterApiKey
            ? `${COINBASE_PAYMASTER_URL}${paymasterApiKey}`
            : COINBASE_PAYMASTER_URL;

        this.publicClient = createPublicClient({
            chain: this.chain,
            transport: http(),
        });
    }

    /**
     * Create a smart account from an EOA private key
     */
    async createSmartAccount(eoaAccount: PrivateKeyAccount): Promise<any> {
        console.log('📦 Creating Smart Account from EOA:', eoaAccount.address);

        // 1. Create simple smart account
        const simpleAccount = await toSimpleSmartAccount({
            client: this.publicClient,
            owner: eoaAccount,
            factoryAddress: SIMPLE_ACCOUNT_FACTORY_ADDRESS,
            entryPoint: {
                address: ENTRYPOINT_ADDRESS_V07,
                version: '0.7',
            },
        });

        console.log('✅ Smart Account Address:', simpleAccount.address);

        // 2. Create smart account client with Coinbase bundler/paymaster
        const smartAccountClient = createSmartAccountClient({
            account: simpleAccount,
            chain: this.chain,
            bundlerTransport: http(this.bundlerUrl),
            // Coinbase bundler handles paymaster sponsorship and gas pricing automatically
            // when configured with the correct API key in bundlerUrl
        });

        console.log('✅ Smart Account Client created with Coinbase paymaster');

        return smartAccountClient;
    }

    /**
     * Send a user operation (transaction) via smart account
     */
    async sendUserOperation(
        smartAccountClient: any,
        calls: Array<{ to: Address; data: `0x${string}`; value?: bigint }>
    ): Promise<string> {
        console.log('🚀 Sending gasless transaction with', calls.length, 'call(s)');

        const userOpHash = await smartAccountClient.sendUserOperation({
            userOperation: {
                callData: await smartAccountClient.account.encodeCallData(calls),
            },
        });

        console.log('✅ User operation sent:', userOpHash);

        // Wait for transaction to be mined
        const receipt = await smartAccountClient.waitForUserOperationReceipt({
            hash: userOpHash,
        });

        console.log('✅ Transaction mined:', receipt.receipt.transactionHash);

        return receipt.receipt.transactionHash;
    }
}

export const smartWalletService = new SmartWalletService(process.env.COINBASE_PAYMASTER_API_KEY);

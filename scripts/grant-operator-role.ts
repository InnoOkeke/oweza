import "dotenv/config";
import { createPublicClient, createWalletClient, http, keccak256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

async function main() {
  const network = (process.env.ESCROW_NETWORK || "base-sepolia") as "base" | "base-sepolia";
  const chain = network === "base" ? base : baseSepolia;
  const rpcUrl = process.env.ESCROW_RPC_URL || chain.rpcUrls.default.http[0];
  const contract = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
  const target = process.argv[2] as `0x${string}` | undefined;
  const privateKey = (process.env.ESCROW_ADMIN_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY) as `0x${string}`;

  if (!contract) {
    throw new Error("ESCROW_CONTRACT_ADDRESS missing");
  }
  if (!target) {
    throw new Error("Pass the smart account address to grant via CLI, e.g. `ts-node grant-operator-role.ts 0xabc...`");
  }
  if (!privateKey) {
    throw new Error("Set ESCROW_ADMIN_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env");
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const roleHash = keccak256(stringToBytes("OPERATOR_ROLE"));
  const txHash = await walletClient.writeContract({
    address: contract,
    abi: [
      {
        name: "grantRole",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "role", type: "bytes32" },
          { name: "account", type: "address" },
        ],
        outputs: [],
      },
    ] as const,
    functionName: "grantRole",
    args: [roleHash, target],
  } as any);

  console.log("Sent grantRole tx:", txHash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("Mined in block", receipt.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

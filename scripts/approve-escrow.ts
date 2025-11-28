import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

async function main() {
  const network = (process.env.ESCROW_NETWORK || "base-sepolia") as "base" | "base-sepolia";
  const chain = network === "base" ? base : baseSepolia;
  const rpcUrl = process.env.ESCROW_RPC_URL || chain.rpcUrls.default.http[0];
  const token = process.env.ESCROW_TOKEN_ADDRESS as `0x${string}`;
  const spender = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
  const privateKey = (process.env.ESCROW_TREASURY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY) as `0x${string}`;
  const amountArg = process.argv.find((arg) => arg.startsWith("--amount="));
  const amount = amountArg ? amountArg.split("=")[1] : process.env.ESCROW_APPROVAL_AMOUNT || "100000"; // default 100k tokens
  const decimals = Number(process.env.ESCROW_TOKEN_DECIMALS || 6);

  if (!token || !spender) {
    throw new Error("ESCROW_TOKEN_ADDRESS and ESCROW_CONTRACT_ADDRESS must be set");
  }
  if (!privateKey) {
    throw new Error("Set ESCROW_TREASURY_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");
  }

  const amountAtomic = parseUnits(amount, decimals);
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const txHash = await walletClient.writeContract({
    address: token,
    abi: [
      {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ] as const,
    functionName: "approve",
    args: [spender, amountAtomic],
  } as any);

  console.log(`Sent approve(${spender}, ${amount}) tx:`, txHash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("Mined in block", receipt.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

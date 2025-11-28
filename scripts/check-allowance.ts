import "dotenv/config";
import { createPublicClient, http } from "viem";
import { baseSepolia, base } from "viem/chains";

async function main() {
  const network = (process.env.ESCROW_NETWORK || "base-sepolia") as "base" | "base-sepolia";
  const chain = network === "base" ? base : baseSepolia;
  const rpcUrl = process.env.ESCROW_RPC_URL || chain.rpcUrls.default.http[0];
  const token = process.env.ESCROW_TOKEN_ADDRESS as `0x${string}`;
  const owner = process.env.ESCROW_TREASURY_WALLET as `0x${string}`;
  const spender = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;

  if (!token || !owner || !spender) {
    throw new Error("Missing env vars");
  }

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const erc20Abi = [
    {
      name: "allowance",
      type: "function",
      stateMutability: "view",
      inputs: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
      ],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "decimals",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ name: "", type: "uint8" }],
    },
  ] as const;

  const [allowance, balance, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] } as any),
    client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] } as any),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" } as any),
  ]) as [bigint, bigint, number];

  console.log("Token decimals:", decimals);
  console.log("Balance:", balance.toString());
  console.log("Allowance:", allowance.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

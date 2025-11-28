import "dotenv/config";
import { createPublicClient, http, keccak256, stringToBytes } from "viem";
import { base, baseSepolia } from "viem/chains";

async function main() {
  const network = (process.env.ESCROW_NETWORK || "base-sepolia") as "base" | "base-sepolia";
  const chain = network === "base" ? base : baseSepolia;
  const rpcUrl = process.env.ESCROW_RPC_URL || chain.rpcUrls.default.http[0];
  const contract = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
  const account = process.env.CDP_BACKEND_SMART_ACCOUNT_ADDRESS as `0x${string}` | undefined;
  const fallbackAccount = process.argv[2] as `0x${string}` | undefined;
  const roleArg = process.argv.find((arg) => arg.startsWith("--role="));

  if (!contract) {
    throw new Error("ESCROW_CONTRACT_ADDRESS is required");
  }

  const targetAccount = fallbackAccount || account;
  if (!targetAccount) {
    throw new Error("Provide smart account address via CDP_BACKEND_SMART_ACCOUNT_ADDRESS env var or CLI arg");
  }

  const roleName = roleArg ? roleArg.split("=")[1] : "operator";
  const roleHash = roleName === "admin"
    ? "0x0000000000000000000000000000000000000000000000000000000000000000"
    : keccak256(stringToBytes("OPERATOR_ROLE"));

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const hasRole = await client.readContract({
    address: contract,
    abi: [
      {
        name: "hasRole",
        type: "function",
        stateMutability: "view",
        inputs: [
          { name: "role", type: "bytes32" },
          { name: "account", type: "address" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ] as const,
    functionName: "hasRole",
    args: [roleHash, targetAccount],
  } as any);

  console.log(`Account ${targetAccount} has ${roleName} role:`, hasRole);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import "dotenv/config";
import { sharedEscrowDriver } from "../src/services/server/SharedEscrowDriver";

async function main() {
  const smartAccount = await (sharedEscrowDriver as any).getSmartAccount();
  console.log("Smart account:", smartAccount.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

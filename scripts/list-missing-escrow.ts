import "dotenv/config";
import { MongoClient } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI missing");
  }

  const client = new MongoClient(uri);
  await client.connect();
  const collection = client.db("metasend").collection("pendingTransfers");

  const filter = {
    status: "pending",
    $or: [
      { escrowTransferId: { $exists: false } },
      { escrowTransferId: null },
      { escrowTransferId: "" },
    ],
  };

  const cursor = collection.find(filter).sort({ createdAt: 1 });
  const results = await cursor.toArray();
  console.log(`Pending transfers missing escrowTransferId: ${results.length}`);
  results.slice(0, 20).forEach((transfer: any, index) => {
    console.log(
      `${index + 1}. transferId=${transfer.transferId}, recipientEmail=${transfer.recipientEmail}, amount=${transfer.amount} ${transfer.token}, createdAt=${transfer.createdAt}`
    );
  });
  if (results.length > 20) {
    console.log(`...and ${results.length - 20} more`);
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

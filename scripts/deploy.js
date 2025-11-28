const hre = require("hardhat");

async function main() {
  console.log("🚀 Starting deployment to Celo Sepolia");
  console.log("━".repeat(50));

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);

  // Check balance
  const balance = await deployer.getBalance();
  console.log("💰 Account balance:", hre.ethers.utils.formatEther(balance), "CELO");

  if (balance.isZero()) {
    console.error("❌ Insufficient balance! Get testnet CELO from:");
    console.error("   https://faucet.celo.org");
    process.exit(1);
  }

  console.log("━".repeat(50));

  // Determine admin address
  const admin = process.env.ESCROW_ADMIN_ADDRESS || deployer.address;
  console.log("👤 Admin address:", admin);

  // Deploy contract
  console.log("\n📦 Deploying SharedEscrow contract...");
  const SharedEscrow = await hre.ethers.getContractFactory("SharedEscrow");
  const escrow = await SharedEscrow.deploy(admin);
  
  console.log("⏳ Waiting for deployment transaction...");
  await escrow.deployed();

  console.log("✅ SharedEscrow deployed to:", escrow.address);

  // Wait for a few block confirmations before verifying
  console.log("\n⏳ Waiting for 5 block confirmations...");
  await escrow.deployTransaction.wait(5);
  console.log("✅ Confirmations received");

  console.log("━".repeat(50));

  // Verify contract on Celoscan
  console.log("\n🔍 Verifying contract on Celoscan...");
  try {
    await hre.run("verify:verify", {
      address: escrow.address,
      constructorArguments: [admin],
    });
    console.log("✅ Contract verified successfully!");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Contract already verified!");
    } else {
      console.error("❌ Verification failed:", error.message);
      console.log("\n💡 You can verify manually later with:");
      console.log(`   npx hardhat verify --network celoSepolia ${escrow.address} ${admin}`);
    }
  }

  console.log("━".repeat(50));
  console.log("\n📋 Deployment Summary:");
  console.log("━".repeat(50));
  console.log("Network: Celo Sepolia (Alfajores)");
  console.log("Contract Address:", escrow.address);
  console.log("Admin Address:", admin);
  console.log("Deployer:", deployer.address);
  console.log("Explorer:", `https://alfajores.celoscan.io/address/${escrow.address}`);
  console.log("━".repeat(50));

  console.log("\n📝 Next Steps:");
  console.log("1. Add contract address to .env:");
  console.log(`   ESCROW_CONTRACT_ADDRESS=${escrow.address}`);
  console.log("\n2. Add treasury wallet to .env:");
  console.log(`   ESCROW_TREASURY_WALLET=${deployer.address}`);
  console.log("\n3. Update Render environment variables with the contract address");
  console.log("\n4. Test the contract:");
  console.log("   - Create a test transfer");
  console.log("   - Claim the transfer");
  console.log("   - Verify on Celoscan");
  console.log("━".repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });

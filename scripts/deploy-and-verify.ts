import hre from "hardhat";
const { ethers, run, network } = hre;

async function main() {
  console.log("🚀 Starting deployment to", network.name);
  console.log("━".repeat(50));

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);

  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "CELO");

  if (balance === 0n) {
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
  const factory = await ethers.getContractFactory("SharedEscrow");
  const contract = await factory.deploy(admin);
  
  console.log("⏳ Waiting for deployment transaction...");
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("✅ SharedEscrow deployed to:", contractAddress);

  // Wait for a few block confirmations before verifying
  console.log("\n⏳ Waiting for 5 block confirmations...");
  await contract.deploymentTransaction()?.wait(5);
  console.log("✅ Confirmations received");

  console.log("━".repeat(50));

  // Verify contract on Celoscan
  console.log("\n🔍 Verifying contract on Celoscan...");
  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [admin],
    });
    console.log("✅ Contract verified successfully!");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Contract already verified!");
    } else {
      console.error("❌ Verification failed:", error.message);
      console.log("\n💡 You can verify manually later with:");
      console.log(`   npx hardhat verify --network ${network.name} ${contractAddress} ${admin}`);
    }
  }

  console.log("━".repeat(50));
  console.log("\n📋 Deployment Summary:");
  console.log("━".repeat(50));
  console.log("Network:", network.name);
  console.log("Contract Address:", contractAddress);
  console.log("Admin Address:", admin);
  console.log("Deployer:", deployer.address);
  console.log("Explorer:", `https://alfajores.celoscan.io/address/${contractAddress}`);
  console.log("━".repeat(50));

  console.log("\n📝 Next Steps:");
  console.log("1. Add contract address to .env:");
  console.log(`   ESCROW_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("\n2. Add treasury wallet to .env:");
  console.log(`   ESCROW_TREASURY_WALLET=${deployer.address}`);
  console.log("\n3. Grant OPERATOR_ROLE to your backend service");
  console.log(`   npx hardhat run scripts/grant-operator-role.ts --network ${network.name}`);
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

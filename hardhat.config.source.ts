import path from "path";
import { fileURLToPath } from "url";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.TS_NODE_PROJECT) {
  process.env.TS_NODE_PROJECT = path.resolve(__dirname, "tsconfig.hardhat.json");
}

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    celoSepolia: {
      url: process.env.CELO_SEPOLIA_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11142220,
    },
    celo: {
      url: process.env.CELO_RPC_URL || "https://forno.celo.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 42220,
    },
  },
  etherscan: {
    apiKey: {
      celoSepolia: process.env.CELOSCAN_API_KEY || "ES86HC8RRYH6H3PE52BJXNC4SM67B7M3M9",
      celo: process.env.CELOSCAN_API_KEY || "ES86HC8RRYH6H3PE52BJXNC4SM67B7M3M9",
    },
    customChains: [
      {
        network: "celoSepolia",
        chainId: 11142220,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io"
        }
      },
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io"
        }
      }
    ]
  },
};

export default config;

import "dotenv/config";
import "@nomicfoundation/hardhat-viem";
import type { HardhatUserConfig } from "hardhat/config";

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = deployerKey ? [deployerKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 1000 } },
  },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      chainId: 84532,
      accounts,
    },
    base: {
      url: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
      chainId: 8453,
      accounts,
    },
  },
};

export default config;

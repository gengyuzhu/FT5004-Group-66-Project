require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const sepoliaUrl = process.env.SEPOLIA_RPC_URL;
const sepoliaPrivateKey = process.env.SEPOLIA_PRIVATE_KEY;

const networks = {
  hardhat: {
    chainId: 31337,
  },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  },
};

if (sepoliaUrl && sepoliaPrivateKey) {
  networks.sepolia = {
    url: sepoliaUrl,
    chainId: 11155111,
    accounts: [sepoliaPrivateKey],
  };
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};

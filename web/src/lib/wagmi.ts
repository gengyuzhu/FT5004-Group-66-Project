"use client";

import { createConfig, http, injected } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";

import { localRpcUrl } from "@/lib/config";

export const wagmiConfig = createConfig({
  chains: [hardhat, sepolia],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(localRpcUrl),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
  ssr: false,
});

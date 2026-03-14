export const defaultChainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 31337);
export const localRpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
export const ipfsGatewayBase =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL?.replace(/\/$/, "") ??
  "https://gateway.pinata.cloud/ipfs";

export const chainLabels: Record<number, string> = {
  31337: "Localhost",
  11155111: "Sepolia",
};

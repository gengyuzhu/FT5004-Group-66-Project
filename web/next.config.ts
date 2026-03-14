import type { NextConfig } from "next";

const ipfsGatewayUrl = new URL(
  process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? "https://gateway.pinata.cloud/ipfs",
);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: ipfsGatewayUrl.protocol.replace(":", "") as "http" | "https",
        hostname: ipfsGatewayUrl.hostname,
        pathname: `${ipfsGatewayUrl.pathname}/**`,
      },
    ],
  },
};

export default nextConfig;

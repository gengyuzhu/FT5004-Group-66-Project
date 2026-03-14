import { ipfsGatewayBase } from "@/lib/config";

export function getIpfsUrl(cidOrUrl?: string | null) {
  if (!cidOrUrl) {
    return null;
  }

  if (cidOrUrl.startsWith("http://") || cidOrUrl.startsWith("https://")) {
    return cidOrUrl;
  }

  if (cidOrUrl.startsWith("/")) {
    return cidOrUrl;
  }

  return `${ipfsGatewayBase}/${cidOrUrl}`;
}

export async function fetchIpfsJson<T>(cidOrUrl?: string | null): Promise<T | null> {
  const target = getIpfsUrl(cidOrUrl);
  if (!target) {
    return null;
  }

  try {
    const response = await fetch(target, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const pinataApiBase = "https://api.pinata.cloud";

function getPinataJwt() {
  const token = process.env.PINATA_JWT;

  if (!token) {
    throw new Error("PINATA_JWT is missing. Add it to web/.env.local before uploading evidence.");
  }

  return token;
}

async function pinataRequest(path: string, init: RequestInit) {
  const response = await fetch(`${pinataApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getPinataJwt()}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Pinata request failed: ${message}`);
  }

  return response.json();
}

export async function uploadFileToPinata(file: File) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: file.name,
    }),
  );

  const payload = await pinataRequest("/pinning/pinFileToIPFS", {
    method: "POST",
    body: formData,
  });

  return payload.IpfsHash as string;
}

export async function uploadJsonToPinata(name: string, content: unknown) {
  const payload = await pinataRequest("/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataMetadata: {
        name,
      },
      pinataContent: content,
    }),
  });

  return payload.IpfsHash as string;
}

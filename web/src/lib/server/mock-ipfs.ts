import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

type StoredAssetManifest = {
  filename: string;
  contentType: string;
};

const mockStorageDir = path.join(process.cwd(), ".mock-ipfs");

function createAssetId(seed: string) {
  return createHash("sha256").update(`${seed}-${Date.now()}`).digest("hex").slice(0, 24);
}

async function ensureStorageDir() {
  await fs.mkdir(mockStorageDir, { recursive: true });
}

function assetPath(assetId: string) {
  return path.join(mockStorageDir, assetId);
}

function manifestPath(assetId: string) {
  return path.join(mockStorageDir, `${assetId}.json`);
}

async function writeAsset(
  assetId: string,
  content: Buffer,
  manifest: StoredAssetManifest,
) {
  await ensureStorageDir();
  await fs.writeFile(assetPath(assetId), content);
  await fs.writeFile(manifestPath(assetId), JSON.stringify(manifest, null, 2), "utf8");

  return `/api/mock-ipfs/${assetId}`;
}

export function isMockIpfsEnabled() {
  return process.env.PINATA_E2E_MODE === "mock";
}

export async function uploadJsonToMockIpfs(name: string, content: unknown) {
  const assetId = createAssetId(name);

  return writeAsset(
    assetId,
    Buffer.from(JSON.stringify(content, null, 2), "utf8"),
    {
      filename: `${name}.json`,
      contentType: "application/json",
    },
  );
}

export async function uploadFileToMockIpfs(file: File) {
  const assetId = createAssetId(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  return writeAsset(
    assetId,
    buffer,
    {
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    },
  );
}

export async function readMockIpfsAsset(assetId: string) {
  const [manifestRaw, content] = await Promise.all([
    fs.readFile(manifestPath(assetId), "utf8"),
    fs.readFile(assetPath(assetId)),
  ]);

  return {
    manifest: JSON.parse(manifestRaw) as StoredAssetManifest,
    content,
  };
}

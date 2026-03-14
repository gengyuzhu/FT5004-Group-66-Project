import { NextResponse } from "next/server";

import { isMockIpfsEnabled, readMockIpfsAsset } from "@/lib/server/mock-ipfs";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  if (!isMockIpfsEnabled()) {
    return NextResponse.json({ error: "Mock IPFS is not enabled." }, { status: 404 });
  }

  const { assetId } = await context.params;

  try {
    const { manifest, content } = await readMockIpfsAsset(assetId);

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": manifest.contentType,
        "Content-Disposition": `inline; filename="${manifest.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Mock IPFS asset not found." }, { status: 404 });
  }
}

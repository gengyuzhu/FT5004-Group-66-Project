import { NextResponse } from "next/server";

import { uploadFileToPinata, uploadJsonToPinata } from "@/lib/server/pinata";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const campaignId = Number(formData.get("campaignId"));
    const milestoneId = Number(formData.get("milestoneId"));
    const summary = String(formData.get("summary") ?? "").trim();
    const demoLinksRaw = String(formData.get("demoLinks") ?? "[]");
    const demoLinks = JSON.parse(demoLinksRaw) as string[];
    const fileEntries = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!Number.isFinite(campaignId) || !Number.isFinite(milestoneId) || !summary) {
      return NextResponse.json(
        {
          error: "Campaign id, milestone id, and proof summary are required.",
        },
        { status: 400 },
      );
    }

    const uploadedFiles = [];
    for (const file of fileEntries) {
      const cid = await uploadFileToPinata(file);
      uploadedFiles.push({
        name: file.name,
        cid,
        type: file.type,
        size: file.size,
      });
    }

    const proof = {
      campaignId,
      milestoneId,
      summary,
      fileCids: uploadedFiles,
      demoLinks,
      submittedAt: new Date().toISOString(),
    };

    const cid = await uploadJsonToPinata(
      `milestonevault-proof-${campaignId}-${milestoneId}-${Date.now()}`,
      proof,
    );

    return NextResponse.json({
      cid,
      proof,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to upload proof bundle.",
      },
      { status: 500 },
    );
  }
}

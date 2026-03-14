import { NextResponse } from "next/server";

import { uploadFileToPinata, uploadJsonToPinata } from "@/lib/server/pinata";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const title = String(formData.get("title") ?? "").trim();
    const summary = String(formData.get("summary") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const goal = String(formData.get("goal") ?? "").trim();
    const fundraisingDeadline = String(formData.get("fundraisingDeadline") ?? "").trim();
    const milestonesRaw = String(formData.get("milestones") ?? "[]");
    const externalLinksRaw = String(formData.get("externalLinks") ?? "[]");

    if (!title || !summary || !description || !goal || !fundraisingDeadline) {
      return NextResponse.json(
        {
          error: "Title, summary, description, goal, and fundraising deadline are required.",
        },
        { status: 400 },
      );
    }

    const milestones = JSON.parse(milestonesRaw) as unknown[];
    const externalLinks = JSON.parse(externalLinksRaw) as string[];

    if (!Array.isArray(milestones) || !milestones.length) {
      return NextResponse.json(
        {
          error: "At least one milestone is required in the metadata bundle.",
        },
        { status: 400 },
      );
    }

    const coverImage = formData.get("coverImage");
    let coverImageCid: string | undefined;

    if (coverImage instanceof File && coverImage.size > 0) {
      coverImageCid = await uploadFileToPinata(coverImage);
    }

    const metadata = {
      title,
      summary,
      description,
      coverImageCid,
      milestones,
      externalLinks,
      createdAt: new Date().toISOString(),
      goal,
      fundraisingDeadline,
    };

    const cid = await uploadJsonToPinata(`milestonevault-campaign-${Date.now()}`, metadata);

    return NextResponse.json({
      cid,
      coverImageCid,
      metadata,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to upload campaign metadata.",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { uploadFileToPinata, uploadJsonToPinata } from "@/lib/server/pinata";
import { isMockIpfsEnabled, uploadFileToMockIpfs, uploadJsonToMockIpfs } from "@/lib/server/mock-ipfs";
import {
  campaignMetadataUploadSchema,
  formatValidationError,
  validateOptionalCoverImage,
} from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rawMilestones = JSON.parse(String(formData.get("milestones") ?? "[]")) as unknown;
    const rawExternalLinks = JSON.parse(String(formData.get("externalLinks") ?? "[]")) as unknown;
    const parsedPayload = campaignMetadataUploadSchema.parse({
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      description: String(formData.get("description") ?? ""),
      goal: String(formData.get("goal") ?? ""),
      fundraisingDeadline: String(formData.get("fundraisingDeadline") ?? ""),
      milestones: rawMilestones,
      externalLinks: rawExternalLinks,
    });

    const coverImage = formData.get("coverImage");
    let coverImageCid: string | undefined;
    const maybeCoverImage = coverImage instanceof File ? coverImage : null;

    validateOptionalCoverImage(maybeCoverImage);

    if (maybeCoverImage && maybeCoverImage.size > 0) {
      coverImageCid = isMockIpfsEnabled()
        ? await uploadFileToMockIpfs(maybeCoverImage)
        : await uploadFileToPinata(maybeCoverImage);
    }

    const metadata = {
      title: parsedPayload.title,
      summary: parsedPayload.summary,
      description: parsedPayload.description,
      coverImageCid,
      milestones: parsedPayload.milestones,
      externalLinks: parsedPayload.externalLinks,
      createdAt: new Date().toISOString(),
      goal: parsedPayload.goal,
      fundraisingDeadline: parsedPayload.fundraisingDeadline,
    };

    const cid = isMockIpfsEnabled()
      ? await uploadJsonToMockIpfs(`milestonevault-campaign-${Date.now()}`, metadata)
      : await uploadJsonToPinata(`milestonevault-campaign-${Date.now()}`, metadata);

    return NextResponse.json({
      cid,
      coverImageCid,
      metadata,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: formatValidationError(error),
        },
        { status: 400 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "Campaign metadata fields must be valid JSON payloads.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to upload campaign metadata.",
      },
      { status: 500 },
    );
  }
}

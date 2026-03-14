import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { uploadFileToPinata, uploadJsonToPinata } from "@/lib/server/pinata";
import { isMockIpfsEnabled, uploadFileToMockIpfs, uploadJsonToMockIpfs } from "@/lib/server/mock-ipfs";
import { formatValidationError, proofUploadSchema, validateProofFiles } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const parsedPayload = proofUploadSchema.parse({
      campaignId: Number(formData.get("campaignId")),
      milestoneId: Number(formData.get("milestoneId")),
      summary: String(formData.get("summary") ?? ""),
      demoLinks: JSON.parse(String(formData.get("demoLinks") ?? "[]")) as unknown,
    });
    const fileEntries = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    validateProofFiles(fileEntries);

    const uploadedFiles = [];
    for (const file of fileEntries) {
      const cid = isMockIpfsEnabled()
        ? await uploadFileToMockIpfs(file)
        : await uploadFileToPinata(file);
      uploadedFiles.push({
        name: file.name,
        cid,
        type: file.type,
        size: file.size,
      });
    }

    const proof = {
      campaignId: parsedPayload.campaignId,
      milestoneId: parsedPayload.milestoneId,
      summary: parsedPayload.summary,
      fileCids: uploadedFiles,
      demoLinks: parsedPayload.demoLinks,
      submittedAt: new Date().toISOString(),
    };

    const cid = isMockIpfsEnabled()
      ? await uploadJsonToMockIpfs(
          `milestonevault-proof-${parsedPayload.campaignId}-${parsedPayload.milestoneId}-${Date.now()}`,
          proof,
        )
      : await uploadJsonToPinata(
          `milestonevault-proof-${parsedPayload.campaignId}-${parsedPayload.milestoneId}-${Date.now()}`,
          proof,
        );

    return NextResponse.json({
      cid,
      proof,
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
          error: "Proof payload links must be valid JSON arrays.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to upload proof bundle.",
      },
      { status: 500 },
    );
  }
}

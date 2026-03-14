import { z } from "zod";

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const httpUrlPattern = /^https?:\/\//i;

const readableText = (label: string, minLength: number, maxLength: number) =>
  z
    .string()
    .trim()
    .min(minLength, `${label} must be at least ${minLength} characters.`)
    .max(maxLength, `${label} must be ${maxLength} characters or fewer.`);

const dateTimeString = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), `${label} must be a valid date and time.`);

const positiveDecimalString = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => decimalPattern.test(value), `${label} must be a positive decimal amount.`)
    .refine((value) => Number(value) > 0, `${label} must be greater than zero.`);

const externalLinkSchema = z
  .string()
  .trim()
  .url("Each external link must be a valid URL.")
  .refine((value) => httpUrlPattern.test(value), "Only http and https links are supported.");

export const campaignMilestoneSchema = z.object({
  title: readableText("Milestone title", 3, 90),
  description: readableText("Milestone description", 8, 1200),
  amount: positiveDecimalString("Milestone amount"),
  dueDate: dateTimeString("Milestone due date"),
  index: z.number().int().nonnegative().optional(),
});

export const campaignMetadataUploadSchema = z
  .object({
    title: readableText("Title", 3, 90),
    summary: readableText("Summary", 8, 240),
    description: readableText("Description", 20, 5000),
    goal: positiveDecimalString("Goal"),
    fundraisingDeadline: dateTimeString("Fundraising deadline"),
    milestones: z
      .array(campaignMilestoneSchema)
      .min(1, "At least one milestone is required.")
      .max(10, "A maximum of 10 milestones is supported in the MVP."),
    externalLinks: z
      .array(externalLinkSchema)
      .max(8, "A maximum of 8 external links is supported.")
      .default([]),
  })
  .superRefine((value, ctx) => {
    const fundingDeadline = Date.parse(value.fundraisingDeadline);
    const goalAmount = Number(value.goal);
    let milestoneTotal = 0;
    let previousDueDate = fundingDeadline;

    value.milestones.forEach((milestone, index) => {
      const dueDate = Date.parse(milestone.dueDate);
      milestoneTotal += Number(milestone.amount);

      if (dueDate <= previousDueDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["milestones", index, "dueDate"],
          message: "Milestone due dates must be strictly increasing and later than fundraising.",
        });
      }

      previousDueDate = dueDate;
    });

    if (Math.abs(milestoneTotal - goalAmount) > 0.000001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["milestones"],
        message: "Milestone amounts must sum exactly to the campaign goal.",
      });
    }
  });

export const proofUploadSchema = z.object({
  campaignId: z.number().int().nonnegative("Campaign id must be a non-negative integer."),
  milestoneId: z.number().int().nonnegative("Milestone id must be a non-negative integer."),
  summary: readableText("Proof summary", 8, 2000),
  demoLinks: z
    .array(externalLinkSchema)
    .max(8, "A maximum of 8 demo links is supported.")
    .default([]),
});

export function formatValidationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid request payload.";
}

export function validateOptionalCoverImage(file: File | null) {
  if (!file || file.size === 0) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Cover image must be an image file.");
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Cover image must be 8 MB or smaller.");
  }
}

export function validateProofFiles(files: File[]) {
  if (files.length > 6) {
    throw new Error("A maximum of 6 proof files is supported.");
  }

  for (const file of files) {
    if (file.size > 15 * 1024 * 1024) {
      throw new Error(`Proof file "${file.name}" must be 15 MB or smaller.`);
    }
  }
}

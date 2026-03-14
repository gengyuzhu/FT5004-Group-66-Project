import { expect, test } from "@playwright/test";

function toDateTimeLocal(offsetMinutes: number) {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

test("campaign upload route rejects invalid metadata payloads", async ({ request }) => {
  const response = await request.post("/api/ipfs/campaign", {
    multipart: {
      title: "Bad campaign",
      summary: "Short but valid summary",
      description: "This payload should fail because the milestone math does not match the goal.",
      goal: "3",
      fundraisingDeadline: toDateTimeLocal(20),
      milestones: JSON.stringify([
        {
          title: "Milestone 1",
          description: "Valid description text",
          amount: "1",
          dueDate: toDateTimeLocal(30),
        },
      ]),
      externalLinks: JSON.stringify(["notaurl"]),
    },
  });

  expect(response.status()).toBe(400);
  const payload = (await response.json()) as { error?: string };
  expect(payload.error).toBeTruthy();
});

test("proof upload route rejects malformed links and oversized file batches", async ({ request }) => {
  const formData = new FormData();
  formData.append("campaignId", "1");
  formData.append("milestoneId", "0");
  formData.append("summary", "Proof summary for validation.");
  formData.append("demoLinks", JSON.stringify(["ftp://unsupported-link.example"]));

  Array.from({ length: 7 }, (_, index) => {
    formData.append(
      "files",
      new File([Buffer.from(`proof ${index}`)], `proof-${index}.txt`, {
        type: "text/plain",
      }),
    );
  });

  const response = await request.post("/api/ipfs/proof", { multipart: formData });

  expect(response.status()).toBe(400);
  const payload = (await response.json()) as { error?: string };
  expect(payload.error).toBeTruthy();
});

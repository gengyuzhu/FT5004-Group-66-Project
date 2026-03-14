import { expect, test } from "@playwright/test";

import { installInjectedWallet, seedActiveCampaign } from "./support/wallet";

test("creator can submit milestone proof through the browser action rail", async ({ page }) => {
  const { campaignId } = await seedActiveCampaign();
  await installInjectedWallet(page, 0);

  await page.goto(`/campaigns/${campaignId.toString()}`);
  await page.getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.getByRole("button", { name: /0xf39f/i })).toBeVisible();

  await page
    .getByLabel("Proof summary")
    .fill("Uploaded by Playwright after the campaign reached Active status on the local chain.");
  await page.getByLabel("Demo links").fill("https://example.com/demo");
  await page.getByLabel("Evidence files").setInputFiles({
    name: "proof.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Milestone evidence from Playwright."),
  });

  await page.getByRole("button", { name: /submit proof/i }).click();

  await expect(page.getByText("Milestone proof submitted.")).toBeVisible();
  await page.getByRole("button", { name: "milestones" }).click();
  await expect(page.getByRole("link", { name: /open proof json/i })).toBeVisible();
});

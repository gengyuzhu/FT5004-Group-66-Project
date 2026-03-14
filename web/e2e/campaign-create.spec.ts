import { expect, test } from "@playwright/test";

import { installInjectedWallet } from "./support/wallet";

function toDateTimeLocal(offsetMinutes: number) {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

test("creator can create a campaign through the real browser flow", async ({ page }) => {
  await installInjectedWallet(page, 0);

  await page.goto("/");
  await page.getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.getByRole("button", { name: /0xf39f/i })).toBeVisible();

  await page.getByRole("button", { name: /^Create$/ }).click();

  await page.getByLabel("Project title").fill("E2E Creator Launch");
  await page.getByLabel("One-line summary").fill("End-to-end browser test for contract-backed campaign creation.");
  await page
    .getByLabel("Project story")
    .fill("This campaign is created from Playwright using an injected wallet and the mock IPFS E2E pipeline.");
  await page.getByLabel("Goal (ETH)").fill("3");
  await page.getByLabel("Fundraising deadline").fill(toDateTimeLocal(20));
  await page.getByLabel("Milestone title").nth(0).fill("Ship alpha");
  await page.getByLabel("Proof expectation").nth(0).fill("Publish the first integrated alpha build.");
  await page.getByLabel("Amount (ETH)").nth(0).fill("1");
  await page.getByLabel("Due date").nth(0).fill(toDateTimeLocal(45));
  await page.getByLabel("Milestone title").nth(1).fill("Ship beta");
  await page.getByLabel("Proof expectation").nth(1).fill("Deliver the second milestone with QA proof.");
  await page.getByLabel("Amount (ETH)").nth(1).fill("2");
  await page.getByLabel("Due date").nth(1).fill(toDateTimeLocal(75));

  await page.getByRole("button", { name: /deploy campaign/i }).click();

  await expect(page.getByText("E2E Creator Launch")).toBeVisible();
  await page.getByRole("link", { name: /open campaign/i }).first().click();
  await expect(page.getByRole("heading", { name: "E2E Creator Launch" })).toBeVisible();
});

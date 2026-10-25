import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const origin = process.env.TEST_ORIGIN || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--disable-gpu"],
});
await mkdir("artifacts", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.screenshot({ path: "artifacts/home-desktop.png", fullPage: true });
  assert.equal(await page.locator("h1").count(), 1);
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({ path: "artifacts/home-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".hero-art").isVisible(), false);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile homepage must not overflow",
  );
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Pricing", exact: true })
    .click();
  await page.waitForURL("**/pricing");
  await page.screenshot({
    path: "artifacts/pricing-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile pricing must not overflow",
  );
  await page.goto(origin + "/auth/signup");
  await page.getByRole("textbox", { name: "Your name" }).fill("Browser QA");
  const email = `browser-${Date.now()}@example.invalid`;
  const password = "Test-only-" + Date.now() + "-password";
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("heading", { name: /Hello/ }).waitFor();
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile dashboard must not overflow",
  );
  await page
    .getByRole("navigation", { name: "Quick navigation" })
    .getByRole("link", { name: "Wallet" })
    .click();
  await page.waitForURL("**/dashboard/wallet");
  await page.getByRole("textbox", { name: "Amount (USD)" }).fill("5.00");
  await page.getByRole("button", { name: "Fund Wallet", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/dashboard/numbers");
  await page.getByRole("heading", { name: "USA Numbers", exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: desktop/mobile layouts, themes, navigation, registration, wallet unavailable state; no page errors",
  );
} finally {
  await browser.close();
}

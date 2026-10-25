import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const origin = "http://localhost:3000";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--disable-gpu"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  assert.equal(await page.locator("h1").count(), 1);
  assert.match(await page.locator("h1").innerText(), /Boost your socials\./);
  assert.match(await page.locator("h1").innerText(), /Find your number\./);
  const cards = page.locator(".service-pillars .service-pillar");
  assert.equal(await cards.count(), 2);
  const social = await cards.nth(0).boundingBox(),
    numbers = await cards.nth(1).boundingBox();
  assert.ok(Math.abs(social.width - numbers.width) < 2);
  assert.ok(Math.abs(social.height - numbers.height) < 2);
  assert.match(await cards.nth(0).innerText(), /Boost Account/);
  assert.match(await cards.nth(1).innerText(), /Numbers & SMS/);
  const boost = page
    .locator(".hero-actions")
    .getByRole("link", { name: "Boost an account", exact: true });
  const number = page
    .locator(".hero-actions")
    .getByRole("link", { name: "Get a number", exact: true });
  assert.equal(
    new URL(await boost.getAttribute("href"), origin).searchParams.get("next"),
    "/boost-account/new-order",
  );
  assert.equal(
    new URL(await number.getAttribute("href"), origin).searchParams.get("next"),
    "/dashboard/numbers",
  );
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Boost Account", exact: true }).click();
  await page.waitForURL("**/social-boosting");
  assert.equal(await page.locator("h1").count(), 1);
  await nav.getByRole("link", { name: "Numbers", exact: true }).click();
  await page.waitForURL("**/numbers");
  await page
    .getByRole("link", { name: "Explore long-term rentals", exact: true })
    .click();
  await page.waitForURL("**/long-term-rentals");
  await page.goto(origin);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/two-services-home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  await page.screenshot({
    path: "artifacts/two-services-home-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(await page.locator(".hero-art").isVisible(), false);
  await page.screenshot({
    path: "artifacts/two-services-home-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open menu" }).click();
  await nav.getByRole("link", { name: "Boost Account", exact: true }).click();
  await page.waitForURL("**/social-boosting");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.goto(origin + "/auth/signup");
  await page.getByRole("textbox", { name: "Your name" }).fill("Positioning QA");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(`positioning-${Date.now()}@example.invalid`);
  await page
    .getByLabel(/^Password/)
    .fill("QA-only-" + Date.now() + "-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("heading", { name: /Hello/ }).waitFor();
  assert.equal(
    await page.locator(".service-pillars .service-pillar").count(),
    0,
  );
  await page
    .getByRole("navigation", { name: "Quick navigation" })
    .getByRole("link", { name: "Boost", exact: true })
    .click();
  await page.waitForURL("**/boost-account/new-order");
  await page
    .getByRole("heading", { name: "Boost Account", exact: true })
    .waitFor();
  await page.goto(origin + "/dashboard");
  await page.getByRole("heading", { name: /Hello/ }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/two-services-dashboard.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS equal homepage service cards and CTA routing, both public hubs, number sub-navigation, desktop/mobile/dark layouts, balanced dashboard and mobile Boost entry",
  );
} finally {
  await browser.close();
}

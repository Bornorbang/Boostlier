import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3000";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--disable-gpu"],
});
async function signup(page, email) {
  await page.goto(origin + "/auth/signup");
  await page.getByRole("textbox", { name: "Your name" }).fill("Ads Browser QA");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page
    .getByLabel(/^Password/)
    .fill("QA-only-" + Date.now() + "-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unauth = await context.request.get(origin + "/api/backend/ads");
  assert.equal(unauth.status(), 401);
  const imagePage = await context.newPage();
  await imagePage.setViewportSize({ width: 1200, height: 400 });
  await imagePage.setContent(
    '<body style="margin:0;background:#b6f34b;color:#193326;display:grid;place-items:center;height:100vh;font:600 50px Arial"><div>Boostlier Ads QA<br><small style="font-size:26px">Your business. One month in the spotlight.</small></div></body>',
  );
  const banner = await imagePage.screenshot();
  await imagePage.close();
  const email = `ads-browser-${Date.now()}@example.invalid`;
  const title = "Browser QA " + Date.now();
  await signup(page, email);
  await page.getByRole("link", { name: "Ads", exact: true }).click();
  await page.waitForURL("**/dashboard/ads");
  async function fill() {
    await page.getByRole("button", { name: "My ads", exact: true }).click();
    await page.getByRole("textbox", { name: "Ad title" }).fill(title);
    await page
      .getByRole("textbox", { name: "Website link" })
      .fill("https://example.com/boostlier-ad");
    await page.getByLabel("Banner image").setInputFiles({
      name: "banner.png",
      mimeType: "image/png",
      buffer: banner,
    });
    await page.getByRole("button", { name: /Publish/ }).click();
    await page.getByRole("dialog", { name: "Publish your ad?" }).waitFor();
    const termsLink = page.getByRole("dialog").getByRole("link", {name:"ads terms",exact:true});
    assert.equal(await termsLink.getAttribute("href"), "/ads#ads-terms");
  }
  await fill();
  await page.getByRole("button", { name: /Pay.*publish/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: /insufficient/ })
    .waitFor();
  assert.equal(
    (await (await context.request.get(origin + "/api/backend/ads")).json()).mine
      .length,
    0,
  );
  await page.getByRole("button", { name: "Keep editing" }).click();
  execFileSync("C:/php/php.exe", [
    "backend/tests/ads-browser-fixture.php",
    "fund",
    email,
  ]);
  await page.reload();
  await fill();
  const purchase = page.waitForRequest(
    (req) => req.url().endsWith("/ads/create") && req.method() === "POST",
  );
  await page.getByRole("button", { name: /Pay.*publish/ }).click();
  const sent = await purchase;
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page
    .locator(".balance-chip strong")
    .filter({ hasText: "10.00" })
    .waitFor();
  const status = await (
    await context.request.get(origin + "/api/backend/ads")
  ).json();
  assert.equal(status.mine.length, 1);
  const ad = status.mine[0];
  assert.equal(ad.price_usd, "10.00");
  const replay = await context.request.post(
    origin + "/api/backend/ads/create",
    {
      headers: { "Idempotency-Key": sent.headers()["idempotency-key"] },
      multipart: {
        title,
        target_url: "https://example.com/boostlier-ad",
        max_price_usd: "10.00",
        terms_version: "2026-10-24",
        banner: { name: "banner.png", mimeType: "image/png", buffer: banner },
      },
    },
  );
  assert.equal(replay.status(), 201);
  assert.equal((await replay.json()).ad.id, ad.id);
  assert.equal(
    (await (await context.request.get(origin + "/api/backend/balance")).json())
      .balance_usd,
    "10.00",
  );
  const card = page
    .locator(".ad-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  assert.equal(
    await card
      .locator("img")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  assert.match(
    await card.getByRole("link", { name: title, exact: true }).getAttribute("rel"),
    /noopener.*sponsored/,
  );
  assert.equal(await card.getByText("Sponsored", { exact: true }).count(), 0);
  assert.doesNotMatch(await card.textContent(), /London time|Ends \d/);
  await page.getByRole("button", { name: "Community ads", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Remove ad", exact: true }).count(), 0);
  assert.equal(await page.locator('.community-view .ads-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3);
  await page.getByRole("button", { name: "My ads", exact: true }).click();
  await page.screenshot({ path: "artifacts/ads-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/ads-mobile-dark.png",
    fullPage: true,
  });
  const viewer = await browser.newContext();
  const other = await viewer.newPage();
  await signup(other, `ads-viewer-${Date.now()}@example.invalid`);
  assert.equal(
    (await viewer.request.get(origin + ad.banner_url)).status(),
    200,
  );
  const publicBoard = await (
    await viewer.request.get(origin + "/api/backend/ads")
  ).json();
  assert.ok(publicBoard.items.some((row) => row.id === ad.id && !row.mine));
  await other.goto(origin + "/dashboard/ads");
  await other.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await other.getByRole("button", { name: "Remove ad", exact: true }).count(), 0);
  assert.equal(
    (
      await viewer.request.post(origin + "/api/backend/ads/remove", {
        data: { id: ad.id, confirmed: true },
      })
    ).status(),
    404,
  );
  await page.getByRole("button", { name: "Remove ad", exact: true }).click();
  await page.getByRole("button", { name: "Keep ad", exact: true }).click();
  await page.getByRole("button", { name: "Remove ad", exact: true }).click();
  await page.getByRole("button", { name: "Remove now", exact: true }).click();
  await page.getByRole("button", { name: "My ads", exact: true }).click();
  await page.getByText("Removed", { exact: true }).waitFor();
  assert.equal(
    (await viewer.request.get(origin + ad.banner_url)).status(),
    404,
  );
  assert.equal(
    (await (await context.request.get(origin + "/api/backend/balance")).json())
      .balance_usd,
    "10.00",
  );
  await page
    .getByRole("button", { name: "Community ads", exact: true })
    .click();
  await fill();
  const secondPurchase = page.waitForResponse(
    (response) =>
      response.url().endsWith("/ads/create") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Pay.*publish/ }).click();
  assert.equal((await secondPurchase).status(), 201);
  await page
    .locator(".balance-chip strong")
    .filter({ hasText: /^\u00240\.00$/ })
    .waitFor();
  const updated = await (
    await context.request.get(origin + "/api/backend/ads")
  ).json();
  const live = updated.mine.find((row) => row.status === "active");
  execFileSync("C:/php/php.exe", [
    "backend/tests/ads-browser-fixture.php",
    "expire",
    email,
    live.id,
  ]);
  assert.equal(
    (await viewer.request.get(origin + live.banner_url)).status(),
    404,
  );
  const after = await (
    await viewer.request.get(origin + "/api/backend/ads")
  ).json();
  assert.ok(!after.items.some((row) => row.id === live.id));
  assert.deepEqual(errors, []);
  console.log(
    "PASS Ads: auth, image upload/preview, insufficient funds, USD 10 payment, replay, shared wallet, community visibility, owner-only removal, expiry, dark theme and mobile layout",
  );
  await viewer.close();
} finally {
  await browser.close();
}

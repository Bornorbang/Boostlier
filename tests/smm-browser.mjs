import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
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
  page.on("request", (r) => {
    assert.doesNotMatch(
      r.url() + JSON.stringify(r.headers()) + (r.postData() || ""),
      /smm_live_[A-Za-z0-9_-]+/,
    );
  });
  await page.goto("http://localhost:3000/auth/signup");
  await page.getByRole("textbox", { name: "Your name" }).fill("Boost QA");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(`boost-browser-${Date.now()}@example.invalid`);
  await page
    .getByLabel(/^Password/)
    .fill("QA-only-" + Date.now() + "-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  const catalogueResponse = await context.request.get("http://localhost:3000/api/backend/smm/catalogue");
  assert.equal(catalogueResponse.status(), 200);
  const catalogue = await catalogueResponse.json();
  for (const service of catalogue.items) {
    assert.doesNotMatch([service.name, service.category, service.description].join(" "), /\b(?:Nigeria|Nigerian|Nigerians|Owlet)\b/iu);
  }
  await page.goto("http://localhost:3000/boost-account/new-order");
  await page
    .getByRole("heading", { name: "Boost Account", exact: true })
    .waitFor();
  const select = page.getByLabel("Service", { exact: true });
  await page.waitForFunction(
    () => document.querySelector("select[required]")?.options.length > 1,
  );
  const value = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(value);
  await page.waitForResponse(
    (r) => r.url().endsWith("/smm/quote") && r.status() === 200,
  );
  await page
    .getByLabel("Public target link")
    .fill("https://example.com/public-post");
  assert.equal(
    await page.getByRole("button", { name: /Place order/ }).isDisabled(),
    false,
  );
  let purchaseRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/smm/purchase")) purchaseRequests++;
  });
  await page.getByRole("button", { name: /Place order/ }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Insufficient wallet balance" })
    .waitFor();
  assert.equal(
    purchaseRequests,
    0,
    "Insufficient funds must not submit a paid order",
  );
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  assert.equal(await page.locator(".boost-toast").count(), 0);
  assert.equal(
    await page.getByText("Find a service", { exact: true }).count(),
    0,
  );
  assert.equal(await page.locator(".boost-service-detail").count(), 0);
  assert.equal(
    await page.getByText("Stay in the loop.", { exact: true }).count(),
    0,
  );
  assert.equal(await page.locator(".boost-builder > button").count(), 1);
  assert.match(await page.locator(".boost-total").innerText(), /\$\d+\.\d{2}/);
  assert.equal(await page.getByText(/matching services/).count(), 0);
  assert.equal(await page.getByRole("checkbox").count(), 0);
  const categorySelect = page.getByRole("button", { name: "Category", exact: true });
  assert.equal(await page.getByRole("combobox", { name: "Search categories" }).count(), 0);
  await categorySelect.click();
  const search = page.getByRole("combobox", { name: "Search categories" });
  const categoryOptions = await page.getByRole("option").count();
  const firstCategory = await page.locator(".category-options [role=option]").nth(1).innerText();
  await search.fill(firstCategory);
  assert.ok(await page.locator(".category-options [role=option]").count() < categoryOptions);
  await search.press("Enter");
  assert.equal(await categorySelect.getAttribute("aria-expanded"), "false");
  assert.equal(await select.inputValue(), "");
  assert.equal(await categorySelect.innerText(), firstCategory);
  await categorySelect.click();
  await search.fill("no-category-matches-123");
  await page.getByText("No categories found.", { exact: true }).waitFor();
  await search.press("Enter");
  assert.equal(purchaseRequests, 0);
  await search.press("Escape");
  assert.equal(await categorySelect.getAttribute("aria-expanded"), "false");
  await categorySelect.click();
  await page.locator("h1").click();
  assert.equal(await categorySelect.getAttribute("aria-expanded"), "false");
  assert.equal(await page.getByRole("button", { name: /cancel/i }).count(), 0);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/boost-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await categorySelect.click();
  await search.fill(firstCategory);
  const popup = await page.locator(".category-popup").boundingBox();
  assert.ok(popup.x >= 0 && popup.x + popup.width <= 390);
  await page.screenshot({ path: "artifacts/boost-mobile.png", fullPage: true });
  await search.press("Escape");
  await page.getByRole("link", { name: "Order history", exact: true }).click();
  await page.waitForURL("**/boost-account/orders");
  await page
    .getByRole("heading", { name: "Your orders", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("button", { name: /cancel/i }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS real-browser Boost catalogue, server USD quote, min quantity, wallet guard, mobile layout, history and no exposed provider credentials",
  );
} finally {
  await browser.close();
}

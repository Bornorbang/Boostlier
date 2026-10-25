import { chromium } from "playwright-core";
import assert from "node:assert/strict";
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
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) =>
    assert.ok(
      !request.url().includes("textverified.com"),
      "Provider requests stay server-side",
    ),
  );
  await page.route("**/api/backend/numbers/prices", (route) => {
    const ids = route.request().postDataJSON().services;
    if (ids.length === 1 && ids[0] === "google") return route.continue();
    return route.fulfill({
      json: { items: ids.map((service) => ({ service, price_usd: "2.00" })) },
    });
  });
  await page.goto(origin + "/auth/signup");
  await page.getByRole("textbox", { name: "Your name" }).fill("Numbers QA");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(`numbers-${Date.now()}@example.invalid`);
  await page.getByLabel(/^Password/).fill(`QA-only-${Date.now()}-password`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  await page
    .getByRole("navigation", { name: "Dashboard navigation" })
    .getByRole("link", { name: "USA Numbers", exact: true })
    .click();
  await page.waitForURL("**/dashboard/numbers");
  const table = page.getByRole("table", { name: "Number services" });
  await table.waitFor();
  const names = await table
    .locator("tbody td:first-child button")
    .allTextContents();
  assert.ok(names.length > 10);
  assert.deepEqual(
    names,
    [...names].sort((a, b) =>
      a.localeCompare(b, "en-GB", { sensitivity: "base" }),
    ),
  );
  assert.equal(await page.getByRole("combobox").count(), 0);
  assert.equal(
    await page
      .getByRole("heading", { name: "From number to code", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Get number", exact: true }).count(),
    0,
  );
  const left = await page.locator(".number-services").boundingBox();
  const right = await page
    .getByRole("heading", { name: "Active & recent numbers", exact: true })
    .locator("xpath=ancestor::section")
    .boundingBox();
  assert.ok(right.x > left.x && Math.abs(right.y - left.y) < 2);
  const priceHeading = await table
    .getByRole("columnheader", { name: "Price", exact: true })
    .boundingBox();
  assert.ok(priceHeading.x > left.x + left.width / 2);
  const search = page.getByRole("searchbox", { name: "Search USA services" });
  const searchPosition = await search.boundingBox();
  await page.locator(".number-services-scroll").evaluate((el) => {
    el.scrollTop = 400;
  });
  assert.equal((await search.boundingBox()).y, searchPosition.y);
  await search.fill("gOoGlE");
  assert.ok(
    (await table.locator("tbody tr").allTextContents()).every((text) =>
      /google/i.test(text),
    ),
  );
  await search.fill("no-such-boostlier-service-123");
  await table
    .getByText("No services match your search.", { exact: true })
    .waitFor();
  await search.fill("");
  await table
    .locator("tbody td:first-child button")
    .filter({ hasText: /^Google$/ })
    .scrollIntoViewIfNeeded();
  await table
    .locator("tbody td:first-child button")
    .filter({ hasText: /^Google$/ })
    .scrollIntoViewIfNeeded();
  const buyGoogle = page.getByRole("button", { name: /^Buy Google for / });
  await buyGoogle.waitFor();
  await buyGoogle.click();
  await page
    .getByRole("alert")
    .filter({ hasText: /insufficient/ })
    .waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    (await (await context.request.get(origin + "/api/backend/balance")).json())
      .balance_usd,
    "0.00",
  );
  // Customer delivery is a fixture. No paid provider number is purchased.
  let completed = false,
    assigned = false,
    purchases = 0;
  const row = () => ({
    id: "browser-number-fixture",
    provider: "textverified",
    service: "google",
    country: "usa",
    phone: "12025550123",
    sms_code: completed ? "001234" : null,
    status: completed ? "completed" : "active",
    can_cancel: !completed,
    price_usd: "1.45",
    expires_at: new Date(Date.now() + 600000).toISOString(),
    messages: completed
      ? [
          {
            body: "Your Google code is 001234",
            created_at: new Date().toISOString(),
          },
        ]
      : [],
  });
  await page.route("**/api/backend/rent", async (route) => {
    purchases++;
    assigned = true;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return route.fulfill({ json: row() });
  });
  await page.route("**/api/backend/rentals?**", (route) =>
    route.fulfill({
      json: { items: assigned ? [row()] : [], total: assigned ? 1 : 0 },
    }),
  );
  await page.route("**/api/backend/status", (route) => {
    completed = true;
    return route.fulfill({ json: row() });
  });
  await buyGoogle.dblclick();
  await page
    .getByRole("button", { name: "Copy number", exact: true })
    .waitFor();
  assert.equal(purchases, 1);
  await page
    .getByRole("button", { name: "Copy SMS code", exact: true })
    .waitFor({ timeout: 20000 });
  await page.getByText("View SMS", { exact: true }).click();
  await page.getByText("Your Google code is 001234", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.screenshot({
    path: "artifacts/numbers-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/numbers-mobile-dark.png",
    fullPage: true,
  });
  await page.goto(origin + "/dashboard/usa");
  await page.waitForURL("**/dashboard/numbers");
  await page.goto(origin + "/dashboard/global");
  await page.getByRole("heading", {name:"Global Numbers",exact:true}).waitFor();
    await page.getByRole("heading", {name:"Get a global number",exact:true}).waitFor();
  assert.equal(await page.getByRole("navigation",{name:"Number services"}).getByRole("link",{name:"Global Numbers",exact:true}).getAttribute("aria-current"),"page");
  assert.deepEqual(
    await page
      .getByRole("navigation", { name: "Number services" })
      .getByRole("link")
      .allTextContents(),
    ["USA Numbers", "Global Numbers", "Long-term Rentals", "History"],
  );
  await page.route("**/api/backend/rentals?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...row(),
            id: "history-number",
            product: "usa",
            status: "completed",
          },
          {
            ...row(),
            id: "history-rental",
            product: "long-term",
            status: "expired",
            sms_code: null,
            phone: "12025550124",
            messages: [],
          },
        ],
        total: 2,
        per_page: 10,
      },
    }),
  );
  await page
    .getByRole("navigation", { name: "Number services" })
    .getByRole("link", { name: "History", exact: true })
    .click();
  await page.waitForURL("**/dashboard/history");
  await page
    .getByRole("heading", { name: "Number history", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Number services" })
      .getByRole("link", { name: "History", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  const history = page.locator(".rental-history-table");
  await history
    .getByRole("cell", { name: "Long-term", exact: true })
    .waitFor();
  assert.equal(
    await history.getByRole("cell", { name: "USA", exact: true }).count(),
    1,
  );
  assert.equal(
    await history.evaluate((el) => getComputedStyle(el).display),
    "table",
  );
  assert.equal(
    await history
      .locator("thead")
      .evaluate((el) => getComputedStyle(el).display),
    "table-header-group",
  );
  assert.ok(
    await history
      .locator("..")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/number-history-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/number-history-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS alphabetical service table, right-aligned prices, two-card layout, direct purchase/no modal, insufficient-funds guard, double-click protection, SMS updates and responsive themes",
  );
} finally {
  await browser.close();
}

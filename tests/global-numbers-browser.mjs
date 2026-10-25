import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) =>
    assert.ok(
      !request.url().includes("5sim.net"),
      "Provider requests stay server-side",
    ),
  );
  let rows = [],
    purchases = 0,
    cancellations = 0,
    balance = 100;
  const offers = [
    {
      country: "england",
      country_name: "England",
      country_code: "GB",
      service: "facebook",
      operator: "high",
      success_rate: 99.9,
      stock: 100,
      price_usd: "1.10",
      quote_id: "a".repeat(32),
    },
    {
      country: "germany",
      country_name: "Germany",
      country_code: "DE",
      service: "facebook",
      operator: "best",
      success_rate: 98,
      stock: 100,
      price_usd: "1.60",
      quote_id: "b".repeat(32),
    },
  ];
  await page.route("**/api/backend/global-numbers/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/countries") ? { items: [{id:"england",name:"England"},{id:"germany",name:"Germany"}] } : path.endsWith("/services")
        ? {
            items: [
              { id: "facebook", name: "Facebook" },
              { id: "telegram", name: "Telegram" },
            ],
          }
        : path.endsWith("/prices")
          ? { items: offers, best_country: "england", currency: "USD" }
          : { synced: 0, deferred: 0 },
    });
  });
  await page.route("**/api/backend/balance", (route) =>
    route.fulfill({
      json: {
        balance_usd: balance.toFixed(2),
        reserved_usd: "0.00",
        currency: "USD",
      },
    }),
  );
  await page.route("**/api/backend/rentals?**", (route) =>
    route.fulfill({
      json: {
        items: rows.filter((row) => row.status !== "cancelled"),
        total: rows.filter((row) => row.status !== "cancelled").length,
        per_page: 10,
      },
    }),
  );
  await page.route("**/api/backend/rent", async (route) => {
    const input = route.request().postDataJSON();
    assert.equal(input.catalogue, "global");
    assert.equal(input.options.quote_id, "a".repeat(32));
    assert.equal(input.max_price_usd, "1.10");
    assert.ok(route.request().headers()["idempotency-key"]);
    purchases++;
    balance -= 1.1;
    const row = {
      id: "global-" + purchases,
      provider: "5sim",
      product: "global",
      country: "england",
      country_code: "GB",
      phone: "+44735069099" + purchases,
      service: "facebook",
      status: "active",
      sms_code: null,
      messages: [],
      expires_at: "2099-01-01T00:00:00Z",
      can_cancel: true,
      price_usd: "1.10",
    };
    rows.unshift(row);
    await route.fulfill({ json: row });
  });
  await page.route("**/api/backend/status", (route) => {
    const id = route.request().postDataJSON().rental_id;
    const row = rows.find((row) => row.id === id);
    Object.assign(row, {
      status: "completed",
      sms_code: "001234",
      messages: [
        { body: "Facebook code: 001234", created_at: "2026-10-21T12:00:00Z" },
      ],
      can_cancel: false,
    });
    return route.fulfill({ json: row });
  });
  await page.route("**/api/backend/cancel", (route) => {
    const id = route.request().postDataJSON().rental_id;
    const row = rows.find((row) => row.id === id);
    row.status = "cancelled";
    balance += 1.1;
    cancellations++;
    return route.fulfill({ json: row });
  });
  await page.goto("http://localhost:3000/auth/signup");
  await page.getByRole("textbox", { name: "Your name" }).fill("Global QA");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(`global-${Date.now()}@example.invalid`);
  await page.getByLabel(/^Password/).fill("Global-QA-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  await page.goto("http://localhost:3000/dashboard/global");
  await page
    .getByRole("heading", { name: "Global Numbers", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("button", { name: "Global service", exact: true }).isDisabled(), true);
  await page.getByRole("button", {name:"Global country",exact:true}).click();
  await page.getByRole("combobox", {name:"Search global countries"}).fill("Eng");
  await page.getByRole("option", {name:"England",exact:true}).click();
  await page
    .getByRole("button", { name: "Global service", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search global services" })
    .fill("Face");
  await page.getByRole("option", { name: "Facebook", exact: true }).click();
  const table = page.getByRole("table", { name: "Global number countries" });
  await table
    .getByRole("button", { name: "Order England for $1.10", exact: true })
    .waitFor();
  assert.equal(await table.getByRole("columnheader", { name: "Success rate" }).count(), 0);
  assert.equal(await table.locator("tbody tr").count(), 1);
  await table
    .getByRole("button", { name: "Order England for $1.10", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Copy number", exact: true })
    .waitFor();
  assert.equal(purchases, 1);
  await page
    .getByRole("button", { name: "Copy SMS code", exact: true })
    .waitFor({ timeout: 20000 });
  await page.getByText("View SMS", { exact: true }).click();
  await page.getByText("Facebook code: 001234", { exact: true }).waitFor();
  await table
    .getByRole("button", { name: "Order England for $1.10", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(purchases, 2);
  assert.equal(cancellations, 1);
  assert.ok(Math.abs(balance - 98.9) < 0.001);
  await page.screenshot({
    path: "artifacts/global-numbers-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/global-numbers-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", {name:"Global country",exact:true}).click();
  await page.getByRole("option", {name:"Germany",exact:true}).click();
  assert.equal(await page.getByRole("button", {name:"Global service",exact:true}).innerText(), "Choose a service");
  assert.equal(await page.getByRole("table", {name:"Global number countries"}).count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS Global Numbers: searchable services, country filtering, selected quote purchase, SMS, cancellation, wallet refresh, desktop/mobile and no runtime errors; fixture purchases only",
  );
} finally {
  await browser.close();
}

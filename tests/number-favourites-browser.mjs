import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  let purchases = 0;
  const batches = [];
  await page.route("**/api/backend/auth/me", (r) =>
    r.fulfill({
      json: { user: { id: "favourites-qa", name: "QA", role: "customer" } },
    }),
  );
  await page.route("**/api/backend/balance", (r) =>
    r.fulfill({ json: { balance_usd: "10.00" } }),
  );
  await page.route("**/api/backend/rentals?**", (r) =>
    r.fulfill({ json: { items: [], total: 0, per_page: 10 } }),
  );
  await page.route("**/api/backend/numbers/services", (r) =>
    r.fulfill({
      json: {
        items: Array.from({ length: 40 }, (_, i) => ({
          id: `s${i}`,
          service: `Service ${String(i).padStart(2, "0")}`,
          price_usd: "2.00",
        })),
      },
    }),
  );
  await page.route("**/api/backend/numbers/prices", (r) => {
    const ids = r.request().postDataJSON().services;
    batches.push(ids);
    return r.fulfill({
      json: { items: ids.map((service) => ({ service, price_usd: "2.00" })) },
    });
  });
  await page.route("**/api/backend/rent", (r) => {
    purchases++;
    return r.fulfill({ json: { status: "active", phone: "12025550123" } });
  });
  await page.goto("http://localhost:3000/dashboard/numbers");
  const table = page.getByRole("table", { name: "Number services" });
  await table.locator("tbody tr").nth(39).waitFor();
  const search = page.getByRole("searchbox", { name: "Search USA services" });
  await search.fill("39");
  assert.equal(await table.locator("tbody tr").count(), 1);
  await search.fill("");
  assert.equal(await table.locator("tbody tr").count(), 40);
  assert.equal(
    await page.locator(".number-services .number-service-pagination").count(),
    0,
  );
  assert.ok(
    await page
      .locator(".number-services-scroll")
      .evaluate((e) => e.scrollHeight > e.clientHeight),
  );
  await page
    .getByRole("button", { name: "Buy Service 00 for \u00242.00", exact: true })
    .waitFor();
  const heart = page.getByRole("button", {
    name: "Favourite Service 39",
    exact: true,
  });
  await heart.scrollIntoViewIfNeeded();
  await heart.click();
  assert.equal(purchases, 0);
  assert.equal(
    await table.locator("tbody tr").first().getAttribute("data-service-id"),
    "s39",
  );
  assert.equal(await heart.getAttribute("aria-pressed"), "true");
  await page.reload();
  await table.locator("tbody tr").first().waitFor();
  assert.equal(
    await table.locator("tbody tr").first().getAttribute("data-service-id"),
    "s39",
  );
  await page
    .getByRole("button", { name: "Buy Service 39 for \u00242.00", exact: true })
    .waitFor();
  await table.locator("tbody tr").first().locator("td").nth(1).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Your number is ready"),
  );
  assert.equal(purchases, 1);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    batches.length,
    0,
    "Scrolling and searching must not fetch row prices",
  );
  await page
    .getByRole("button", { name: "Favourite Service 39", exact: true })
    .click();
  assert.equal(
    await table.locator("tbody tr").first().getAttribute("data-service-id"),
    "s0",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    "PASS scrollable catalogue, snapshot prices without scroll/search requests, persistent favourites, unpinning, heart isolation, immediate row purchase and mobile layout",
  );
} finally {
  await browser.close();
}

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
  let records = Array.from({ length: 13 }, (_, index) => ({
    id: "rental-" + index,
    country: "usa",
    provider: "textverified",
    service: "Service " + index,
    phone: "1202555" + String(1000 + index),
    status: index === 1 ? "completed" : "active",
    sms_code: index === 1 ? "001234" : null,
    can_cancel: index !== 1,
    price_usd: "1.45",
    expires_at: "2099-01-01T00:00:00Z",
    messages: [],
  }));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/backend/auth/me", (route) =>
    route.fulfill({
      json: { user: { id: "qa", name: "QA", role: "customer" } },
    }),
  );
  await page.route("**/api/backend/balance", (route) =>
    route.fulfill({ json: { balance_usd: "10.00" } }),
  );
  await page.route("**/api/backend/numbers/services", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/backend/rentals?**", (route) => {
    const pageNumber = Number(
      new URL(route.request().url()).searchParams.get("page"),
    );
    const visible = records.filter(
      (row) =>
        ["active", "completed"].includes(row.status) &&
        new Date(row.expires_at) > new Date(),
    );
    return route.fulfill({
      json: {
        items: visible.slice((pageNumber - 1) * 10, pageNumber * 10),
        total: visible.length,
        per_page: 10,
      },
    });
  });
  await page.route("**/api/backend/cancel", (route) => {
    const id = route.request().postDataJSON().rental_id;
    records = records.filter((row) => row.id !== id);
    return route.fulfill({
      json: { status: "active", hidden_from_numbers: true },
    });
  });
  await page.route("**/api/backend/status", (route) =>
    route.fulfill({ json: { status: "active" } }),
  );
  await page.goto("http://localhost:3000/dashboard/numbers");
  const card = page
    .getByRole("heading", { name: "Active & recent numbers", exact: true })
    .locator("xpath=ancestor::section");
  await card.locator("tbody tr").nth(9).waitFor();
  assert.deepEqual(await card.locator("thead th").allTextContents(), [
    "",
    "Number",
    "Service",
    "Code",
    "Status",
    "",
  ]);
  assert.equal(await card.locator("tbody tr").count(), 10);
  assert.equal(
    await card.getByRole("img", { name: "United States flag" }).count(),
    10,
  );
  assert.ok(
    (await card.getByRole("status", { name: "Waiting for SMS code" }).count()) >
      0,
  );
  await card
    .getByRole("button", { name: "Copy SMS code", exact: true })
    .waitFor();
  assert.equal(
    await card
      .locator('tr:has-text("Service 1")')
      .first()
      .getByRole("button", { name: "Cancel", exact: true })
      .count(),
    0,
  );
  const first = card.locator("tbody tr").first();
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://localhost:3000",
    });
  const phone = first.getByRole("button", { name: "Copy number", exact: true });
  assert.equal(await phone.locator("svg").count(), 0);
  const text = await phone.textContent();
  await phone.click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text);
  assert.equal((await first.getByRole("img", {name:"United States flag"}).boundingBox()).width, 18);
  assert.equal(
    await first
      .locator(".number-status-active")
      .evaluate((el) => getComputedStyle(el).color),
    "rgb(21, 128, 61)",
  );
  assert.deepEqual(
    await first
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
      })),
    { color: "rgb(255, 255, 255)", background: "rgb(220, 38, 38)" },
  );

  assert.match(
    await first
      .getByRole("button", { name: "Cancel", exact: true })
      .getAttribute("class"),
    /danger/,
  );
  await card.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".rental-table tbody")?.children.length === 3,
  );
  await card.getByRole("button", { name: "Previous", exact: true }).click();
  await card.locator("tbody tr").nth(9).waitFor();
  await first.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".rental-table tbody")
        ?.textContent.includes("Service 0"),
  );
  assert.equal(await card.locator("tbody tr").count(), 10);
  // The browser removes expired rows without waiting for a provider response or issuing a refund.
  records.find((row) => row.id === "rental-2").expires_at = new Date(
    Date.now() + 1800,
  ).toISOString();
  await card.getByRole("button", { name: "Refresh rentals" }).click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".rental-table tbody")
        ?.textContent.includes("Service 2"),
    null,
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".rental-table tbody tr").length === 10,
  );
  assert.equal(await card.locator("tbody tr").count(), 10);
  await page.screenshot({
    path: "artifacts/number-rentals-columns.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS flags/column order, code spinner and delivered code, red active-only cancellation, row removal, expiry and ten-item pagination",
  );
} finally {
  await browser.close();
}

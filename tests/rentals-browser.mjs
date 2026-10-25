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
  const durations = {
    oneDay: "1 day",
    threeDay: "3 days",
    sevenDay: "7 days",
    fourteenDay: "14 days",
    thirtyDay: "30 days",
    ninetyDay: "90 days",
    oneYear: "1 year",
  };
  let items = [],
    purchases = 0,
    extensions = 0,
    cancellations = 0;
  let inboxFails = false;
  // Only rental responses are fixtures. Authentication uses the running local app.
  await page.route("**/api/backend/number-rentals**", async (route) => {
    const path = new URL(route.request().url()).pathname.split(
      "/number-rentals",
    )[1];
    let data;
    if (path === "/catalogue")
      data = {
        items: [
          { id: "google", name: "Google" },
          { id: "whatsapp", name: "WhatsApp" },
        ],
        durations,
      };
    else if (path === "/quote")
      data = {
        price_usd: "3.40",
        duration: route.request().postDataJSON().duration,
      };
    else if (path === "/purchase") {
      assert.ok(route.request().headers()["idempotency-key"]);
      assert.equal(route.request().postDataJSON().max_price_usd, "3.40");
      purchases++;
      items = [
        {
          id: "rental-fixture",
          phone: "12025550123",
          service: "Google",
          duration: "sevenDay",
          status: "active",
          price_usd: "3.40",
          expires_at: "2099-01-01T00:00:00Z",
          refundable: true,
          can_extend: true,
        },
      ];
      data = { status: "active" };
    } else if (path === "/messages") {
      if (inboxFails)
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "PROVIDER_UNAVAILABLE",
              message: "Provider unavailable for this test",
            },
          },
        });
      data = {
        items: [
          {
            id: "sms-1",
            sender: "Google",
            text: "Your code is 001234",
            code: "001234",
            created_at: "2026-10-19T12:00:00Z",
          },
        ],
      };
    } else if (path === "/extend") {
      extensions++;
      items[0].expires_at = "2099-01-08T00:00:00Z";
      data = { status: "active" };
    } else if (path === "/cancel") {
      cancellations++;
      items[0] = {
        ...items[0],
        status: "cancelled",
        refundable: false,
        can_extend: false,
      };
      data = { status: "cancelled" };
    } else data = { items, pending: [], total: items.length };
    return route.fulfill({ json: data });
  });
  await page.goto("http://localhost:3000/auth/signup");
  await page.getByRole("textbox", { name: "Your name" }).fill("Rentals QA");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(`rentals-${Date.now()}@example.invalid`);
  await page.getByLabel(/^Password/).fill(`Rental-QA-${Date.now()}-password`);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  await page.goto("http://localhost:3000/dashboard/rentals");
  await page.getByRole("button", {name:"Rental service",exact:true}).click();
  await page.getByRole("combobox",{name:"Search rental services"}).fill("gOo");
  assert.equal(await page.getByRole("option",{name:"WhatsApp",exact:true}).count(),0);
  await page.getByRole("option",{name:"Google",exact:true}).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Rental duration" })
      .locator("option")
      .count(),
    7,
  );
  const buy = page.getByRole("button", { name: "Rent number", exact: true });
  await buy.waitFor();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Rent number",
      )?.disabled,
  );
  await buy.click();
  await page.getByRole("button", { name: "Messages", exact: true }).waitFor();
  assert.equal(purchases, 1);
  const actions = page.locator('.rental-row-actions');
  assert.equal(await actions.evaluate(el => getComputedStyle(el).flexWrap), 'nowrap');
  assert.equal(await actions.getByRole('button',{name:'Messages',exact:true}).evaluate(el=>getComputedStyle(el).fontSize),'10px');
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Your code is 001234", { exact: true }).waitFor();
  assert.equal(await dialog.getByText("001234", { exact: true }).count(), 1);
  const box = await dialog.boundingBox();
  assert.ok(
    Math.abs(box.x + box.width / 2 - 720) < 3 &&
      Math.abs(box.y + box.height / 2 - 500) < 3,
    "Modal is centred",
  );
  inboxFails = true;
  await dialog.getByRole("button", { name: "Refresh messages" }).click();
  await dialog.getByText("Provider unavailable for this test").waitFor();
  assert.equal(
    await dialog.getByText("No messages yet.", { exact: true }).count(),
    0,
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Extend", exact: true }).click();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Pay and extend",
      )?.disabled,
  );
  await dialog.getByRole("button", { name: "Pay and extend" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(extensions, 1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(cancellations, 0, "Cancellation requires confirmation");
  await dialog
    .getByRole("button", { name: "Cancel rental", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(cancellations, 1);
  await page.screenshot({
    path: "artifacts/rentals-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const cards = await page.locator(".rental-dashboard-layout > section").all();
  const left = await cards[0].boundingBox(),
    right = await cards[1].boundingBox();
  assert.ok(right.y >= left.y + left.height, "Mobile cards stack");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No page horizontal overflow",
  );
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await page.screenshot({
    path: "artifacts/rentals-mobile-dark.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS rental browser: purchase, SMS, provider error, extension, cancellation, centred modal, mobile layout, no runtime errors; no paid provider calls",
  );
} finally {
  await browser.close();
}

import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
const dbPath = resolve(`artifacts/admin-qa-${Date.now()}.sqlite`);
const env = {
  ...process.env,
  DB_DSN: `sqlite:${dbPath}`,
  APP_ENV: "testing",
  APP_URL: "http://localhost:3000",
  TEMP_MAIL_PRICE_CENTS: "70",
  ADS_PRICE_CENTS: "1000",
  TEXTVERIFIED_API_KEY: "",
  TEXTVERIFIED_API_USERNAME: "",
  SMM_API_KEY: "",
  RAPIDAPI_TEMP_MAIL_KEY: "",
  STRIPE_SECRET_KEY: "",
};
const fixture = JSON.parse(
  execFileSync("C:/php/php.exe", ["tests/admin-fixture.php"], {
    env,
    encoding: "utf8",
  }),
);
const server = spawn(
  "C:/php/php.exe",
  ["-S", "127.0.0.1:8873", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
const base = "http://127.0.0.1:8873";
let browser;
try {
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const adminCookie = `tn_session=${fixture.admin.token}`;
  for (const route of [
    "overview",
    "users",
    "numbers",
    "rentals",
    "boost-orders",
    "temp-mail",
    "ads",
    "wallet-history",
    "payments",
    "support",
    "operations",
    "audit-log",
    "settings",
    "rewards",
    "reward-settings",
  ]) {
    assert.equal((await fetch(base + "/admin/" + route)).status, 401);
    assert.equal(
      (
        await fetch(base + "/admin/" + route, {
          headers: { Cookie: `tn_session=${fixture.customer.token}` },
        })
      ).status,
      403,
    );
    const res = await fetch(base + "/admin/" + route, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(res.status, 200, route + ": " + (await res.text()));
  }
  const denied = await fetch(base + "/admin/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `tn_session=${fixture.customer.token}`,
    },
    body: JSON.stringify({
      section: "users",
      action: "update",
      id: fixture.customer.id,
      role: "admin",
      reason: "unauthorised",
    }),
  });
  assert.equal(denied.status, 403);
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  await context.addCookies([
    {
      name: "tn_session",
      value: fixture.admin.token,
      domain: "localhost",
      path: "/",
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/backend/**", async (route) => {
    const path =
      new URL(route.request().url()).pathname.replace("/api/backend", "") +
      new URL(route.request().url()).search;
    const response = await route.fetch({ url: base + path });
    await route.fulfill({ response });
  });
  await page.goto("http://localhost:3000/admin");
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page
    .locator(".admin-stats .stat-card")
    .first()
    .getByText("24", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".admin-stats .stat-card").count(), 12);
  await page.screenshot({
    path: "artifacts/admin-overview.png",
    fullPage: true,
  });
  await page.goto("http://localhost:3000/admin/rentals");
  await page.getByRole("heading", { name: "Rentals", exact: true }).waitFor();
  await page.getByRole("cell", { name: "12025550124", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("cell", { name: "7 days", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page
    .getByRole("heading", { name: "Purchase & extension history", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Review pending operation" }).waitFor();
  const rentalActions = await page
    .getByRole("dialog")
    .getByLabel("Action")
    .locator("option")
    .allTextContents();
  assert.ok(
    rentalActions.includes("Inspect inbox messages") &&
      rentalActions.includes("Attempt cancellation"),
  );
  await page.screenshot({
    path: "artifacts/admin-rentals.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close record", exact: true }).click();
  await page.goto("http://localhost:3000/admin/users");
  assert.equal(await page.locator('input[type="date"]').count(), 0);
  await page.getByRole("searchbox").fill("customer@example.invalid");
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (USD)").waitFor();
  assert.equal(await dialog.locator(".admin-record-fields").count(), 0);
  assert.deepEqual(
    await page.locator(".admin-table thead th").allTextContents(),
    ["User", "Email", ""],
  );
  assert.ok(await page.locator(".admin-user-name small").textContent());
  assert.doesNotMatch(
    await page.locator(".admin-user-name small").textContent(),
    /\d{2}:\d{2}/,
  );
  assert.equal(await dialog.getByLabel("Reason / operator note").count(), 0);
  const box = await dialog.boundingBox();
  assert.ok(Math.abs(box.x + box.width / 2 - 720) < 3);
  assert.ok(Math.abs(box.y + box.height / 2 - 525) < 3);
  await dialog.getByLabel("Amount (USD)").fill("1.234");
  await dialog.getByRole("button", { name: "Apply action" }).click();
  await dialog
    .getByText("Enter a valid USD amount, such as 5, 5.5 or 5.50.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await dialog.getByLabel("Amount (USD)").getAttribute("pattern"),
    null,
  );
  await dialog.getByLabel("Amount (USD)").fill("5");
  await dialog.getByRole("button", { name: "Apply action" }).click();
  await dialog.getByText("Action completed.", { exact: true }).waitFor();
  assert.equal(await dialog.locator(".admin-record-fields").count(), 0);
  await page.screenshot({
    path: "artifacts/admin-customer.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Close record" }).click();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await dialog.locator(".admin-record-fields").first().waitFor();
  const shownId = await dialog
    .locator(".admin-record-fields > div")
    .filter({ has: page.locator("dt", { hasText: /^Id$/ }) })
    .locator("dd")
    .textContent();
  assert.match(shownId, /^\d+$/);
  assert.equal(
    await dialog.getByText(fixture.customer.id, { exact: true }).count(),
    0,
  );
  await dialog.getByText("25.00", { exact: true }).waitFor();
  assert.equal(await dialog.locator(".admin-action-form").count(), 0);
  await dialog.getByRole("button", { name: "Close record" }).click();
  await page.goto("http://localhost:3000/admin/wallet-history");
  await page
    .getByRole("combobox", { name: "Kind", exact: true })
    .selectOption("adjustment");
  await page
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption("credit");
  assert.equal(
    await page.getByRole("combobox", { name: "Sort by", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Sort order", exact: true })
      .count(),
    0,
  );
  const reset = page.getByRole("button", {
    name: "Reset filters",
    exact: true,
  });
  assert.ok((await reset.boundingBox()).width < 120);
  assert.equal(
    await reset.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(182, 243, 75)",
  );
  await page.getByRole("button", { name: "View", exact: true }).waitFor();
  await page.goto("http://localhost:3000/admin/numbers");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await dialog.getByText("001234", { exact: true }).waitFor();
  await dialog.getByRole("combobox").first().selectOption("sync");
  await dialog.getByRole("button", { name: "Apply action" }).click();
  await dialog.getByText("Action completed.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Close record" }).click();
  await page.goto("http://localhost:3000/admin/boost-orders");
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("combobox", { name: "Service", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("combobox", { name: "Sort by", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Sort order", exact: true })
      .count(),
    0,
  );
  assert.ok(
    (
      await page
        .getByRole("button", { name: "Reset filters", exact: true })
        .getAttribute("class")
    ).includes("admin-reset-filters"),
  );
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await dialog.locator("option[value=refill]").waitFor({ state: "attached" });
  await dialog.getByRole("button", { name: "Close record" }).click();
  await page.goto("http://localhost:3000/admin/temp-mail");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await dialog.getByRole("combobox").first().selectOption("extend");
  await dialog.getByRole("button", { name: "Apply action" }).click();
  await dialog.getByText("Action completed.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Close record" }).click();
  await page.goto("http://localhost:3000/admin/ads");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await dialog.getByRole("combobox").first().selectOption("edit");
  await dialog.getByLabel("Ad title").fill("Reviewed banner");
  await dialog.getByRole("button", { name: "Apply action" }).click();
  await dialog.getByText("Reviewed banner", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Close record" }).click();
  await page.goto("http://localhost:3000/admin/settings");
  await page.getByLabel("Price per 24 hours (USD)").fill("0.90");
  await page.getByLabel("Reason for change").fill("QA configured price");
  await page.getByRole("button", { name: "Save pricing", exact: true }).click();
  await page
    .getByText("Pricing saved. New purchases use these prices.", {
      exact: true,
    })
    .waitFor();
  await page.goto("http://localhost:3000/admin/rewards");
  await page.getByRole("heading", {name:"Rewards programme",exact:true}).waitFor();
  await page.getByRole("button", {name:"Pause rewards",exact:true}).click();
  await page.getByRole("button", {name:"Enable rewards",exact:true}).waitFor();
  await page.getByRole("button", {name:"Enable rewards",exact:true}).click();
  await page.getByRole("button", {name:"Pause rewards",exact:true}).waitFor();
  await page.goto("http://localhost:3000/admin/audit-log");
  await page.getByRole("searchbox").fill("admin_wallet_adjusted");
  await page.getByRole("button", { name: "View", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "artifacts/admin-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("http://localhost:3000/admin/users");
  await page.getByRole("searchbox").fill("customer@example.invalid");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Name", { exact: true }).waitFor();
  assert.equal(await dialog.locator(".admin-record-fields").count(), 0);
  assert.equal(
    await dialog.getByLabel("Email", { exact: true }).inputValue(),
    "customer@example.invalid",
  );
  await dialog.getByRole("button", { name: "Close record" }).click();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page
    .getByRole("button", { name: "Return to admin", exact: true })
    .waitFor();
  const impersonated = await page.evaluate(async () => ({
    me: await (await fetch("/api/backend/auth/me")).json(),
    admin: (await fetch("/api/backend/admin/overview")).status,
  }));
  assert.equal(impersonated.me.user.id, fixture.customer.id);
  assert.equal(impersonated.admin, 403);
  const locked = await fetch(base + "/admin/action", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      section: "users",
      action: "update",
      id: fixture.customer.id,
      status: "disabled",
      reason: "QA lock during customer session",
    }),
  });
  assert.equal(locked.status, 200);
  await page.reload();
  await page
    .getByRole("button", { name: "Return to admin", exact: true })
    .click();
  await page.waitForURL("**/admin/users");
  await page.getByRole("searchbox").fill("customer@example.invalid");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Account status", exact: true })
    .selectOption("active");
  await dialog.getByRole("button", { name: "Apply action" }).click();
  await dialog.getByText("Action completed.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Close record" }).click();
  await page.getByRole("button", { name: "Login", exact: true }).waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Make Admin", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".admin-user-actions button:nth-child(4)")
        ?.disabled,
  );
  assert.equal(
    await page.getByRole("button", { name: "Login", exact: true }).isDisabled(),
    true,
  );
  const demoted = await fetch(base + "/admin/action", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      section: "users",
      action: "update",
      id: fixture.customer.id,
      role: "customer",
      reason: "QA restore customer role",
    }),
  });
  assert.equal(demoted.status, 200);
  const secondAdmin = await fetch(base + "/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.invalid",
      password: "QA-test-password",
    }),
  });
  assert.equal(secondAdmin.status, 200);
  const secondCookie = secondAdmin.headers
    .getSetCookie()
    .find((c) => c.startsWith("tn_session="))
    .split(";")[0];
  const secondCustomer = await fetch(base + "/admin/impersonate", {
    method: "POST",
    headers: { Cookie: secondCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ id: fixture.customer.id }),
  });
  assert.equal(secondCustomer.status, 200);
  const childCookie = secondCustomer.headers
    .getSetCookie()
    .find((c) => c.startsWith("tn_session="))
    .split(";")[0];
  await fetch(base + "/auth/logout", {
    method: "POST",
    headers: { Cookie: secondCookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(
    (await fetch(base + "/auth/me", { headers: { Cookie: childCookie } }))
      .status,
    401,
    "Revoked administrator sessions must invalidate their customer sessions",
  );
  const login = await fetch(base + "/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "customer@example.invalid",
      password: "QA-test-password",
    }),
  });
  assert.equal(login.status, 200);
  fixture.customer.token = login.headers
    .getSetCookie()
    .find((c) => c.startsWith("tn_session="))
    .split(";")[0]
    .split("=")[1];
  assert.deepEqual(errors, []);
  await context.clearCookies();
  await context.addCookies([
    {
      name: "tn_session",
      value: fixture.customer.token,
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.goto("http://localhost:3000/admin");
  await page
    .getByText("Administrator access is required.", { exact: true })
    .waitFor();
  console.log(
    "PASS real admin RBAC, wallet filters/sort, row actions, edit, customer login/return, lock/unlock, service management, pricing, audit and mobile",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbPath, { force: true });
}

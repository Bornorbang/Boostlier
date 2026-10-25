import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
const db = resolve(`artifacts/admin-qa-api-browser-${Date.now()}.sqlite`);
const env = {
  ...process.env,
  DB_DSN: `sqlite:${db}`,
  APP_ENV: "testing",
  APP_URL: "http://localhost:3000",
  TEXTVERIFIED_API_KEY: "",
  TEXTVERIFIED_API_USERNAME: "",
  SMM_API_KEY: "",
  RAPIDAPI_TEMP_MAIL_KEY: "",
  STRIPE_SECRET_KEY: "",
};
const f = JSON.parse(
  execFileSync("C:/php/php.exe", ["tests/admin-fixture.php"], {
    env,
    encoding: "utf8",
  }),
);
const server = spawn(
  "C:/php/php.exe",
  ["-S", "127.0.0.1:8879", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8879/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    {
      name: "tn_session",
      value: f.customer.token,
      domain: "localhost",
      path: "/",
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/backend/**", async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({
      url:
        "http://127.0.0.1:8879" +
        u.pathname.replace("/api/backend", "") +
        u.search,
    });
    await route.fulfill({ response });
  });
  await page.goto("http://localhost:3000/dashboard/api");
  await page
    .getByRole("heading", { name: "Developer API", exact: true })
    .waitFor();
  assert.equal(await page.locator("input[type=password]").count(), 0);
  await page
    .getByRole("button", { name: "Generate API key", exact: true })
    .click();
  await page.getByText("Save this key now:", { exact: true }).waitFor();
  const first = await page.locator(".alert code").textContent();
  await page
    .getByRole("button", { name: "Rotate API key", exact: true })
    .click();
  await page.waitForFunction(
    (old) => document.querySelector(".alert code")?.textContent !== old,
    first,
  );
  assert.equal(await page.getByText("Active", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate API key", exact: true })
    .waitFor();
  const spec = await (await fetch("http://localhost:3000/openapi.json")).json();
  assert(spec.paths["/api/v1/global-numbers/prices"]);
  for (const path of [
    "/balance",
    "/wallet",
    "/profile",
    "/announcements",
    "/rewards",
    "/rewards/claim",
    "/ads",
    "/support",
    "/payments/checkout",
  ])
    assert(!spec.paths["/api/v1" + path]);
  assert.equal(Object.values(spec.paths).flatMap(Object.values).length, 34);
  const details = page.locator("details.doc-endpoint");
  assert.equal(await details.count(), 34);
  await page
    .locator("details")
    .filter({ hasText: "/api/v1/temp-mail/message" })
    .first()
    .locator("summary")
    .click();
  await page.screenshot({ path: "artifacts/api-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/api-mobile-dark.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "API dashboard: generate, rotate, revoke, no password; 34 service operations; OpenAPI; desktop/mobile overflow; no browser errors: PASS",
  );
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) => server.once("exit", r));
  rmSync(db, { force: true });
}

import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { rmSync, writeFileSync } from "node:fs";
const db = resolve(`artifacts/admin-qa-api-all-site-${Date.now()}.sqlite`);
const env = {
  ...process.env,
  DB_DSN: `sqlite:${db}`,
  APP_ENV: "testing",
  APP_URL: "http://localhost:3000",
  TEXTVERIFIED_API_KEY: "",
  TEXTVERIFIED_API_USERNAME: "",
  SMM_API_KEY: "",
  RAPIDAPI_TEMP_MAIL_KEY: "",
  FIVESIM_API_KEY: "",
  STRIPE_SECRET_KEY: "",
};
const f = JSON.parse(
  execFileSync("C:/php/php.exe", ["tests/api-all-fixture.php"], {
    env,
    encoding: "utf8",
  }),
);
const server = spawn(
  "C:/php/php.exe",
  ["-S", "127.0.0.1:8884", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
let browser;
const checks = [];
try {
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8884/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const groups = {
    public: [
      "/",
      "/social-boosting",
      "/numbers",
      "/pricing",
      "/long-term-rentals",
      "/dedicated-numbers",
      "/temporary-email",
      "/developers",
      "/faq",
      "/ads",
      "/services/whatsapp",
      "/services/telegram",
      "/services/google",
      "/legal/terms",
      "/legal/privacy",
      "/auth/signin",
      "/auth/signup",
      "/auth/forgot-password",
    ],
    customer: [
      "/dashboard",
      "/dashboard/numbers",
      "/dashboard/global",
      "/dashboard/rentals",
      "/dashboard/history",
      "/dashboard/wallet",
      "/dashboard/wallet/activity",
      "/dashboard/temp-mail",
      "/dashboard/ads",
      "/dashboard/rewards",
      "/dashboard/api",
      "/dashboard/announcements",
      "/dashboard/support",
      "/dashboard/profile",
      "/dashboard/profile/change-password",
      "/boost-account/new-order",
      "/boost-account/orders",
    ],
    admin: [
      "/admin",
      ...[
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
        "announcements",
        "updates",
      ].map((p) => "/admin/" + p),
    ],
  };
  for (const [group, paths] of Object.entries(groups)) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    if (group !== "public")
      await context.addCookies([
        {
          name: "tn_session",
          value: f[group === "admin" ? "admin" : "customer"].token,
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
          "http://127.0.0.1:8884" +
          u.pathname.replace("/api/backend", "") +
          u.search,
      });
      await route.fulfill({ response });
    });
    for (const path of paths) {
      const r = await page.goto("http://localhost:3000" + path, {
        waitUntil: "networkidle",
      });
      assert.equal(r.status(), 200, path);
      await page.locator("h1:visible").first().waitFor();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(70);
        const overflow = await page.evaluate(() => ({
          page: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        checks.push({
          group,
          path,
          width,
          overflow: overflow.page > overflow.viewport,
        });
      }
    }
    assert.deepEqual(errors, [], group + " browser runtime errors");
    await context.close();
    console.log(
      "PASS route rendering: " + group + " " + paths.length + " pages",
    );
  }
  writeFileSync(
    "artifacts/site-readiness-browser.json",
    JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2),
  );
  const overflow = checks.filter((c) => c.overflow);
  console.log(
    JSON.stringify(
      { routes: checks.length / 2, viewportChecks: checks.length, overflow },
      null,
      2,
    ),
  );
  if (overflow.length) process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) => server.once("exit", r));
  rmSync(db, { force: true });
}

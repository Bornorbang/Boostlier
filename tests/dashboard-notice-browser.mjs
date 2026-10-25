import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
const db = resolve(`artifacts/admin-qa-notice-${Date.now()}.sqlite`);
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
  execFileSync("C:/php/php.exe", ["tests/admin-fixture.php"], {
    env,
    encoding: "utf8",
  }),
);
const server = spawn(
  "C:/php/php.exe",
  ["-S", "127.0.0.1:8885", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8885/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const request = async (path, token, method = "GET", body) => {
    const r = await fetch("http://127.0.0.1:8885" + path, {
      method,
      headers: {
        ...(token ? { Cookie: `tn_session=${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  assert.equal((await request("/dashboard-notice")).status, 401);
  assert.equal(
    (
      await request("/admin/dashboard-notice", f.customer.token, "PATCH", {
        text: "bad",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/admin/dashboard-notice", f.admin.token, "PATCH", {
        text: "x".repeat(1001),
      })
    ).status,
    422,
  );
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  async function pageFor(token) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await ctx.addCookies([
      { name: "tn_session", value: token, domain: "localhost", path: "/" },
    ]);
    const p = await ctx.newPage();
    await p.route("**/api/backend/**", async (route) => {
      const u = new URL(route.request().url());
      const response = await route.fetch({
        url:
          "http://127.0.0.1:8885" +
          u.pathname.replace("/api/backend", "") +
          u.search,
      });
      await route.fulfill({ response });
    });
    return p;
  }
  const customer = await pageFor(f.customer.token);
  await customer.goto("http://localhost:3000/dashboard");
  await customer.getByRole("heading", { name: /Hello/ }).waitFor();
  assert.equal(
    await customer
      .getByRole("link", { name: "Your USD wallet", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await customer
      .getByText(
        "Your social promotion orders and number rentals, in one workspace.",
        { exact: true },
      )
      .count(),
    0,
  );
  assert.equal(await customer.locator(".dashboard-marquee").count(), 0);
  const admin = await pageFor(f.admin.token);
  await admin.goto("http://localhost:3000/admin/announcements");
  const field = admin.getByLabel("Dashboard notice text");
  await field.waitFor();
  await field.fill("Welcome to Boostlier <b>new services</b>");
  await admin
    .getByRole("button", { name: "Save dashboard notice", exact: true })
    .click();
  await admin.getByText("Dashboard notice saved.", { exact: true }).waitFor();
  await customer.reload();
  const track = customer.locator(".dashboard-marquee-track");
  await track.waitFor();
  assert.equal(
    await track.textContent(),
    "Welcome to Boostlier <b>new services</b>",
  );
  assert.equal(await track.locator("b").count(), 0);
  assert.equal(
    await track.evaluate((e) => getComputedStyle(e).animationIterationCount),
    "infinite",
  );
  const first = await track.evaluate(
    (e) => new DOMMatrix(getComputedStyle(e).transform).m41,
  );
  await customer.waitForTimeout(350);
  const second = await track.evaluate(
    (e) => new DOMMatrix(getComputedStyle(e).transform).m41,
  );
  assert(second < first, "Notice must move right to left");
  assert.equal(await customer.locator(".dashboard-marquee button").count(), 0);
  assert.equal(
    await track.evaluate((e) => getComputedStyle(e).color),
    "rgb(0, 0, 0)",
  );
  const greeting = await customer
    .locator(".dashboard-greeting h1")
    .boundingBox();
  const notice = await customer.locator(".dashboard-marquee").boundingBox();
  assert(notice.x >= greeting.x + greeting.width);
  assert(
    Math.abs(notice.y + notice.height / 2 - greeting.y - greeting.height / 2) <
      3,
  );
  await customer.setViewportSize({ width: 390, height: 844 });
  assert(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await customer.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await track.evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await customer.screenshot({
    path: "artifacts/dashboard-notice-mobile.png",
    fullPage: true,
  });
  await field.fill("");
  await admin
    .getByRole("button", { name: "Save dashboard notice", exact: true })
    .click();
  await admin.getByText("Dashboard notice hidden.", { exact: true }).waitFor();
  await customer.reload();
  await customer.getByRole("heading", { name: /Hello/ }).waitFor();
  assert.equal(await customer.locator(".dashboard-marquee").count(), 0);
  console.log(
    "PASS admin save/clear, RBAC, persistence, safe text, old header removal, right-to-left loop, greeting alignment, green/black styling, no pause, mobile and reduced motion.",
  );
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) => server.once("exit", r));
  rmSync(db, { force: true });
}

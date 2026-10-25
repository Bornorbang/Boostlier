import { chromium } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const env = {
  ...process.env,
  DB_DSN: `sqlite:${resolve(`artifacts/account-mail-${Date.now()}.sqlite`)}`,
  APP_ENV: "testing",
  APP_URL: "http://localhost:3000",
  SMTP_HOST: "",
};
const fixture = (action) =>
  JSON.parse(
    execFileSync("C:/php/php.exe", ["tests/account-mail-fixture.php", action], {
      env,
      encoding: "utf8",
    }),
  );
fixture("setup");
const server = spawn(
  "C:/php/php.exe",
  ["-S", "127.0.0.1:8886", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8886/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const request = async (path, data, cookie) => {
    const r = await fetch("http://127.0.0.1:8886" + path, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const account = {
    name: "Email QA",
    email: "email-qa@example.invalid",
    password: "original-test-password",
  };
  const signup = await request("/auth/signup", account);
  assert.equal(signup.status, 201);
  assert.deepEqual(fixture("state").queue, [
    { kind: "welcome", status: "pending" },
  ]);
  const welcome = fixture("deliver");
  assert.equal(welcome.messages[0].subject, "Welcome to Boostlier");
  const known = await request("/auth/forgot-password", {
    email: account.email,
  });
  const unknown = await request("/auth/forgot-password", {
    email: "missing@example.invalid",
  });
  assert.deepEqual(known.body, unknown.body);
  assert.equal(known.status, 200);
  const reset = fixture("deliver");
  const link = reset.messages[0].text.match(
    /http:\/\/localhost:3000\/auth\/reset-password\?token=[a-f0-9]{64}/,
  )[0];
  const token = new URL(link).searchParams.get("token");
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext();
  await context.route("**/api/backend/**", (route) => {
    const u = new URL(route.request().url());
    return route.continue({
      url:
        "http://127.0.0.1:8886" +
        u.pathname.replace("/api/backend", "") +
        u.search,
    });
  });
  const page = await context.newPage();
  await page.goto(link);
  await page.waitForFunction(() => !location.search);
  assert.equal(
    await page.locator('button[type="submit"],form button.button').isEnabled(),
    true,
  );
  await page.locator("input[name=password]").fill("replacement-test-password");
  await page
    .locator("input[name=confirm_password]")
    .fill("different-test-password");
  await page.locator("form button").click();
  await page
    .getByText("Your passwords do not match.", { exact: true })
    .waitFor();
  await page
    .locator("input[name=confirm_password]")
    .fill("replacement-test-password");
  await page.locator("form button").click();
  await page
    .getByText("Password reset. You can now sign in.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("form").count(), 0);
  assert.equal((await request("/auth/me", null, signup.cookie)).status, 401);
  assert.equal(
    (
      await request("/auth/reset-password", {
        token,
        password: "another-test-password",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/auth/signin", {
        email: account.email,
        password: account.password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/signin", {
        email: account.email,
        password: "replacement-test-password",
      })
    ).status,
    200,
  );
  await page.goto("http://localhost:3000/auth/reset-password");
  await page
    .getByText(
      "This reset link is invalid. Request a new password reset email.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await page.locator("form button").isDisabled(), true);
  console.log(
    "PASS signup welcome, generic reset response, queued delivery, browser password confirmation, token removal, successful reset, session revocation, replay rejection, old/new password login, missing token",
  );
} finally {
  await browser?.close();
  server.kill();
}

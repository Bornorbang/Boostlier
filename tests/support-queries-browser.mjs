import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
const env = {
  ...process.env,
  DB_DSN: `sqlite:${resolve(`artifacts/support-queries-${Date.now()}.sqlite`)}`,
  APP_ENV: "testing",
  APP_URL: "http://localhost:3000",
  SMTP_HOST: "",
  SUPPORT_EMAIL: "support@boostlier.com",
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
  ["-S", "127.0.0.1:8889", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
let browser;
async function request(path, data, cookie, key) {
  const r = await fetch("http://127.0.0.1:8889" + path, {
    method: data ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8889/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal((await request("/support")).status, 401);
  const account = await request("/auth/signup", {
    name: "Support QA",
    email: "support-test@example.invalid",
    password: "long-test-password",
  });
  const payload = {
    issue_type: "payment",
    reference: "test-payment",
    description: "Test query: my payment has not credited my wallet.",
  };
  const result = await request(
    "/support",
    payload,
    account.cookie,
    "support-test-key",
  );
  assert.equal(result.status, 201);
  assert.equal(
    (await request("/support", payload, account.cookie, "support-test-key"))
      .body.id,
    result.body.id,
  );
  assert.equal(
    (await request("/support", payload, account.cookie, "support-new-key"))
      .status,
    429,
  );
  assert.equal(
    fixture("state").queue.filter((q) => q.kind === "support").length,
    1,
  );
  const delivered = fixture("deliver").messages.find((m) =>
    m.subject.startsWith("Boostlier support:"),
  );
  assert.equal(delivered.to, "support@boostlier.com");
  assert.ok(delivered.text.includes(payload.description));
  const other = await request("/auth/signup", {
    name: "Browser support QA",
    email: "support-browser@example.invalid",
    password: "long-test-password",
  });
  assert.equal(
    (await request("/support", null, other.cookie)).body.items.length,
    0,
  );
  for (const receipt of [
    new Blob(["<html>Not a receipt</html>"], { type: "image/png" }),
    new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }),
  ]) {
    const form = new FormData();
    form.set("issue_type", "payment");
    form.set("receipt", receipt, "receipt.png");
    const response = await fetch("http://127.0.0.1:8889/support", {
      method: "POST",
      headers: {
        Cookie: other.cookie,
        "Idempotency-Key": "invalid-receipt-test",
      },
      body: form,
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, "INVALID_ATTACHMENT");
  }
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "tn_session",
      value: other.cookie.split("=")[1],
      domain: "localhost",
      path: "/",
    },
  ]);
  await context.route("**/api/backend/**", async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({
      url:
        "http://127.0.0.1:8889" +
        u.pathname.replace("/api/backend", "") +
        u.search,
      headers: { ...route.request().headers(), cookie: other.cookie },
    });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://localhost:3000/dashboard/support");
    await page
      .getByRole("heading", { name: "Contact support", exact: true })
      .waitFor();
    if (width === 1440) {
      const links = await page.locator(".side-links a").allTextContents();
      assert.ok(links.indexOf("Contact support") > links.indexOf("API"));
      assert.equal(await page.locator(".support-nav-divider").count(), 1);
    }
    const payment = page.locator("details").filter({
      has: page.locator("summary", {
        hasText: "I paid, but my wallet has not been credited",
      }),
    });
    await payment.locator("summary").click();
    assert.equal(
      await payment.getByLabel("Email", { exact: true }).inputValue(),
      "support-browser@example.invalid",
    );
    assert.equal(
      await payment.getByLabel("Email", { exact: true }).isDisabled(),
      true,
    );
    assert.equal(await payment.locator('input[name="reference"]').count(), 0);
    assert.equal(await payment.locator("textarea").count(), 0);
    if (width === 1440) {
      await payment.locator('input[type="file"]').setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=",
          "base64",
        ),
      });
      await payment.getByRole("button", { name: "Send query" }).click();
      await payment
        .getByText(
          "Your query has been received. Our support team will reply to your account email.",
          { exact: true },
        )
        .waitFor();
    }
    assert.equal(
      await page
        .getByText("I am having trouble with the developer API", {
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator(".support-email-note")
        .evaluate((e) => getComputedStyle(e).textAlign),
      "center",
    );
    const sms = page.locator("details").filter({
      has: page.locator("summary", {
        hasText: "I have not received an SMS code",
      }),
    });
    await sms.locator("summary").click();
    assert.equal(await sms.locator("form").count(), 0);
    assert.equal(
      await page
        .getByText(
          "My number was cancelled or expired, but I cannot see a refund",
          { exact: true },
        )
        .count(),
      0,
    );
    const detail = page.locator("details").filter({
      has: page.locator("summary", {
        hasText: "My Boost Account order is delayed",
      }),
    });
    await detail.locator("summary").click();
    assert.equal(await detail.locator("form").count(), 0);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    console.log(`PASS support accordion and query form at ${width}px`);
  }
  const sent = fixture("deliver").messages.find((m) =>
    m.subject.startsWith("Boostlier support:"),
  );
  assert.equal(sent.to, "support@boostlier.com");
  assert.deepEqual(sent.attachment_names, ["payment-receipt.png"]);
  console.log(
    "PASS authenticated support submissions, retry safety, cooldown, inbox delivery routing and owner isolation",
  );
} finally {
  await browser?.close();
  server.kill();
}

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
const sessions = new Map(),
  keys = new Map();
let creates = 0;
let failOnce = false;
const provider = createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  let data;
  if (req.method === "POST" && u.pathname === "/checkout/sessions") {
    const key = req.headers["idempotency-key"];
    if (keys.has(key)) data = keys.get(key);
    else {
      let raw = "";
      for await (const b of req) raw += b;
      const p = new URLSearchParams(raw);
      const id = "cs_test_mock_" + ++creates;
      data = {
        id,
        url: "https://checkout.stripe.com/c/pay/" + id,
        mode: "payment",
        livemode: false,
        currency: "usd",
        amount_total: Number(p.get("line_items[0][price_data][unit_amount]")),
        client_reference_id: p.get("client_reference_id"),
        metadata: {
          payment_id: p.get("metadata[payment_id]"),
          user_id: p.get("metadata[user_id]"),
        },
        payment_status: "unpaid",
        status: "open",
      };
      sessions.set(id, data);
      keys.set(key, data);
    }
  } else if (req.method === "GET")
    data = sessions.get(u.pathname.split("/").at(-1));
  res.setHeader("Content-Type", "application/json");
  if (req.method === "POST" && failOnce) {
    failOnce = false;
    res.writeHead(503);
    res.end("{}");
    return;
  }
  if (!data) {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  res.end(JSON.stringify(data));
});
await new Promise((r) => provider.listen(8892, "127.0.0.1", r));
const env = {
  ...process.env,
  DB_DSN: `sqlite:${resolve(`artifacts/stripe-mock-${Date.now()}.sqlite`)}`,
  APP_ENV: "testing",
  APP_URL: "http://localhost:3000",
  SMTP_HOST: "",
  STRIPE_SECRET_KEY: "sk_test_mock",
  STRIPE_WEBHOOK_SECRET: "whsec_mock",
  STRIPE_TEST_API_URL: "http://127.0.0.1:8892",
  FLW_SECRET_KEY: "",
};
execFileSync("C:/php/php.exe", ["tests/account-mail-fixture.php", "setup"], {
  env,
});
const server = spawn(
  "C:/php/php.exe",
  ["-S", "127.0.0.1:8891", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
let cookie, browser;
async function request(path, data, headers = {}) {
  const r = await fetch("http://127.0.0.1:8891" + path, {
    method: data ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function webhook(session, signature = true) {
  const raw = JSON.stringify({
    type: "checkout.session.completed",
    data: { object: session },
  });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec_mock")
    .update(t + "." + raw)
    .digest("hex");
  const r = await fetch("http://127.0.0.1:8891/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": `t=${t},v1=${signature ? sig : "forged"}`,
    },
    body: raw,
  });
  return r.status;
}
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8891/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  cookie = (
    await request("/auth/signup", {
      name: "Stripe QA",
      email: "stripe-test@example.invalid",
      password: "long-test-password",
    })
  ).cookie;
  const options = (await request("/payments/options")).body;
  assert.equal(options.provider, "stripe");
  assert.equal(options.providers.length, 1);
  const q = (
    await request("/payments/quote", {
      provider: "stripe",
      amount_usd: "10.00",
    })
  ).body;
  const checkout = await request("/payments/checkout", { quote_id: q.id });
  assert.equal(checkout.status, 200);
  await request("/payments/checkout", { quote_id: q.id });
  assert.equal(creates, 1);
  assert.equal(
    (await request("/payments/verify", { reference: checkout.body.reference }))
      .body.status,
    "pending",
  );
  const session = [...sessions.values()][0];
  assert.equal(await webhook({ ...session, payment_status: "paid" }), 200);
  assert.equal((await request("/balance")).body.balance_usd, "0.00");
  assert.equal(await webhook(session, false), 400);
  session.payment_status = "paid";
  session.status = "complete";
  assert.equal(await webhook(session), 200);
  assert.equal(await webhook(session), 200);
  await request("/payments/verify", { reference: checkout.body.reference });
  assert.equal((await request("/balance")).body.balance_usd, "10.00");
  const retryQuote = (
    await request("/payments/quote", { provider: "stripe", amount_usd: "2.00" })
  ).body;
  failOnce = true;
  assert.equal(
    (await request("/payments/checkout", { quote_id: retryQuote.id })).status,
    503,
  );
  const ambiguous = (await request("/wallet")).body.payments.find(
    (p) => p.amount_cents === 200,
  );
  assert.ok(ambiguous);
  await request("/payments/verify", { reference: ambiguous.id });
  assert.equal(creates, 2);
  const recovered = [...sessions.values()].find(
    (s) => s.metadata.payment_id === ambiguous.id,
  );
  recovered.payment_status = "paid";
  recovered.status = "complete";
  await webhook(recovered);
  assert.equal((await request("/balance")).body.balance_usd, "12.00");
  const ownerCookie = cookie;
  cookie = (
    await request("/auth/signup", {
      name: "Other QA",
      email: "stripe-other@example.invalid",
      password: "long-test-password",
    })
  ).cookie;
  assert.equal(
    (await request("/payments/verify", { reference: checkout.body.reference }))
      .status,
    404,
  );
  assert.equal(
    (await request("/payments/checkout", { quote_id: q.id })).status,
    404,
  );
  cookie = ownerCookie;
  if (process.argv.includes("--browser")) {
    browser = await chromium.launch({
      executablePath:
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      headless: true,
    });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      await context.addCookies([
        {
          name: "tn_session",
          value: cookie.split("=")[1],
          domain: "localhost",
          path: "/",
        },
      ]);
      await context.route("**/api/backend/**", async (route) => {
        const u = new URL(route.request().url());
        const response = await route.fetch({
          url:
            "http://127.0.0.1:8891" +
            u.pathname.replace("/api/backend", "") +
            u.search,
          headers: { ...route.request().headers(), cookie },
        });
        await route.fulfill({ response });
      });
      await context.route("https://checkout.stripe.com/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<h1>Mock Stripe checkout</h1>",
        }),
      );
      const page = await context.newPage();
      await page.goto("http://localhost:3000/dashboard/wallet");
      await page.getByRole("button", { name: "$5", exact: true }).click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === "Fund Wallet" && !b.disabled,
        ),
      );
      assert.equal(await page.getByLabel("Payment country").count(), 0);

      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page
        .getByRole("button", { name: "Fund Wallet", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Mock Stripe checkout" })
        .waitFor();
      await context.close();
      console.log(`PASS Stripe wallet preview/hosted redirect at ${width}px`);
    }
  }
  console.log(
    "PASS Stripe HTTP: USD quotes, retry safety, pending payment, forged callback rejection, API re-verification, exactly-once credit and ownership",
  );
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) => provider.close(r));
}

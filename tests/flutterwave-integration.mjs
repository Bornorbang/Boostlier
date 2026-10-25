import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
const transactions = new Map();
let creates = 0;
let fxFail = false;
const provider = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let data;
  if (url.pathname === "/transfers/rates") {
    if (fxFail) {
      res.writeHead(503);
      res.end("{}");
      return;
    }
    data = {
      source: {
        currency: url.searchParams.get("source_currency"),
        amount: (Number(url.searchParams.get("amount")) * 1500).toFixed(2),
      },
      destination: { currency: "USD", amount: url.searchParams.get("amount") },
    };
  } else if (url.pathname === "/payments") {
    let raw = "";
    for await (const b of req) raw += b;
    const b = JSON.parse(raw);
    creates++;
    transactions.set(b.tx_ref, {
      id: 100 + creates,
      tx_ref: b.tx_ref,
      amount: b.amount,
      currency: b.currency,
      status: "pending",
    });
    data = {
      link: "https://checkout.flutterwave.com/v3/hosted/pay/mock-" + creates,
    };
  } else if (url.pathname === "/transactions/verify_by_reference")
    data = transactions.get(url.searchParams.get("tx_ref"));
  if (!data) {
    res.writeHead(400);
    res.end("{}");
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "success", data }));
});
await new Promise((r) => provider.listen(8888, "127.0.0.1", r));
const env = {
  ...process.env,
  DB_DSN: `sqlite:${resolve(`artifacts/flutterwave-${Date.now()}.sqlite`)}`,
  APP_ENV: "testing",
  APP_URL: "http://localhost:3000",
  SMTP_HOST: "",
  STRIPE_SECRET_KEY: "",
  FLW_SECRET_KEY: "mock-key",
  FLW_SECRET_HASH: "mock-webhook",
  FLW_TEST_API_URL: "http://127.0.0.1:8888",
  BACKEND_PROXY_SECRET: "mock-proxy",
};
execFileSync("C:/php/php.exe", ["tests/account-mail-fixture.php", "setup"], {
  env,
});
const server = spawn(
  "C:/php/php.exe",
  ["-S", "127.0.0.1:8887", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
let cookie;
async function request(path, data, headers = {}) {
  const r = await fetch("http://127.0.0.1:8887" + path, {
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
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8887/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  cookie = (
    await request("/auth/signup", {
      name: "Funding QA",
      email: "funding@example.invalid",
      password: "long-test-password",
    })
  ).cookie;
  assert.equal(
    (await request("/payments/options", null, { "x-boostlier-country": "NG" }))
      .body.country,
    "OTHER",
  );
  assert.equal(
    (
      await request("/payments/options", null, {
        "x-boostlier-country": "NG",
        "x-boostlier-proxy-secret": "mock-proxy",
      })
    ).body.country,
    "NG",
  );
  const q = (
    await request("/payments/quote", { amount_usd: "10.00", country: "NG" })
  ).body;
  assert.equal(q.checkout_currency, "NGN");
  assert.equal(q.checkout_amount, "15000.00");
  const checkout = await request("/payments/checkout", { quote_id: q.id });
  assert.equal(checkout.status, 200);
  assert.equal(
    (await request("/payments/checkout", { quote_id: q.id })).body.checkout_url,
    checkout.body.checkout_url,
  );
  assert.equal(creates, 1);
  assert.equal((await request("/balance")).body.balance_usd, "0.00");
  const pending = await request("/payments/verify", {
    reference: checkout.body.reference,
  });
  assert.equal(pending.body.status, "pending");
  const tx = [...transactions.values()][0];
  tx.status = "successful";
  tx.amount = "1.00";
  assert.equal(
    (await request("/payments/verify", { reference: checkout.body.reference }))
      .status,
    409,
  );
  assert.equal((await request("/balance")).body.balance_usd, "0.00");
  tx.amount = "15000.00";
  assert.equal(
    (
      await request(
        "/webhooks/flutterwave",
        { event: "charge.completed", data: tx },
        { "verif-hash": "forged" },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/webhooks/flutterwave",
        { event: "charge.completed", data: tx },
        { "verif-hash": "mock-webhook" },
      )
    ).status,
    200,
  );
  await request("/payments/verify", { reference: checkout.body.reference });
  await request(
    "/webhooks/flutterwave",
    { event: "charge.completed", data: tx },
    { "verif-hash": "mock-webhook" },
  );
  assert.equal((await request("/balance")).body.balance_usd, "10.00");
  fxFail = true;
  const fallback = (
    await request("/payments/quote", { amount_usd: "5.00", country: "KE" })
  ).body;
  assert.equal(fallback.checkout_currency, "USD");
  assert.equal(fallback.fallback, true);
  const ownerCookie = cookie;
  cookie = (
    await request("/auth/signup", {
      name: "Other QA",
      email: "other-funding@example.invalid",
      password: "long-test-password",
    })
  ).cookie;
  assert.equal(
    (await request("/payments/checkout", { quote_id: q.id })).status,
    404,
  );
  assert.equal(
    (await request("/payments/verify", { reference: checkout.body.reference }))
      .status,
    404,
  );
  cookie = ownerCookie;
  console.log(
    "PASS Flutterwave HTTP integration: country trust, local quote, hosted checkout, retry safety, pending/no credit, underpayment rejection, signed webhook verification, exactly-once USD credit, FX fallback, ownership",
  );
  if (process.argv.includes("--browser")) {
    fxFail = false;
    const browser = await chromium.launch({
      executablePath:
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      headless: true,
    });
    try {
      for (const width of [1440, 390]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
        });
        await context.addCookies([
          {
            name: "tn_session",
            value: ownerCookie.split("=")[1],
            domain: "localhost",
            path: "/",
          },
        ]);
        await context.route("**/api/backend/**", async (route) => {
          const url = new URL(route.request().url());
          const response = await route.fetch({
            url:
              "http://127.0.0.1:8887" +
              url.pathname.replace("/api/backend", "") +
              url.search,
            headers: { ...route.request().headers(), cookie: ownerCookie },
          });
          return route.fulfill({ response });
        });
        await context.route("https://checkout.flutterwave.com/**", (route) =>
          route.fulfill({
            contentType: "text/html",
            body: "<h1>Mock Flutterwave checkout</h1>",
          }),
        );
        const page = await context.newPage();
        await page.goto("http://localhost:3000/dashboard/wallet");
        await page.getByLabel("Payment country").selectOption("NG");
        await page.getByRole("button", { name: "$10", exact: true }).click();

        await page.waitForFunction(() =>
          [...document.querySelectorAll("button")].some(
            (b) => b.textContent.trim() === "Fund Wallet" && !b.disabled,
          ),
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page
          .getByRole("button", { name: "Fund Wallet", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Mock Flutterwave checkout" })
          .waitFor();
        await context.close();
        console.log(
          `PASS Flutterwave wallet preview and hosted redirect at ${width}px`,
        );
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
  await new Promise((r) => provider.close(r));
}

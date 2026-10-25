import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const origin = process.env.TEST_ORIGIN || "http://localhost:3000";
let cookie = "";
let passed = 0;
async function call(path, method = "GET", body, headers = {}) {
  const res = await fetch(origin + "/api/backend" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, body: await res.json(), headers: res.headers };
}
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
await check("All public routes serve HTML and canonical metadata", async () => {
  for (const path of [
    "/",
    "/pricing",
    "/social-boosting",
    "/numbers",
    "/long-term-rentals",
    "/dedicated-numbers",
    "/temporary-email",
    "/developers",
    "/faq",
    "/services/whatsapp",
    "/services/telegram",
    "/services/google",
    "/legal/terms",
    "/legal/privacy",
  ]) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 200, path);
    const html = await r.text();
    assert.match(html, /<h1[ >]/);
    assert.match(html, /rel="canonical"/);
    assert.match(html, /og:image/);
  }
});
await check("Unknown routes return HTTP 404", async () => {
  assert.equal((await fetch(origin + "/there-is-no-such-page")).status, 404);
  assert.equal((await fetch(origin + "/reseller")).status, 404);
  assert.equal((await fetch(origin + "/dashboard/does-not-exist")).status, 404);
});
await check("Private HTML carries noindex", async () => {
  for (const path of [
    "/dashboard",
    "/admin",
    "/auth/signin",
    "/payment/return",
    "/boost-account/new-order",
  ])
    assert.match(await (await fetch(origin + path)).text(), /noindex/);
});
await check(
  "Public pricing directs number customers to live service quotes",
  async () => {
    const html = await (await fetch(origin + "/pricing")).text();
    assert.match(html, /Live number prices, in US dollars/);
    assert.match(html, /Check number prices/);
  },
);
await check(
  "Protected backend independently rejects unauthenticated requests",
  async () => {
    assert.equal((await call("/balance")).status, 401);
    assert.equal((await call("/admin/overview")).status, 401);
  },
);
const email = "qa-" + randomBytes(6).toString("hex") + "@example.invalid";
const password = randomBytes(20).toString("hex");
await check(
  "Registration creates a zero-balance wallet and secure session",
  async () => {
    const r = await call("/auth/signup", "POST", {
      name: "QA Account",
      email,
      password,
    });
    assert.equal(r.status, 201);
    assert.ok(cookie.startsWith("tn_session="));
    assert.match(r.headers.get("set-cookie"), /HttpOnly/i);
    assert.equal((await call("/balance")).body.balance_usd, "0.00");
  },
);
await check(
  "Profile updates persist and no private hash is exposed",
  async () => {
    assert.equal(
      (await call("/profile", "PATCH", { name: "Updated QA" })).status,
      200,
    );
    const r = await call("/auth/me");
    assert.equal(r.body.user.name, "Updated QA");
    assert.equal(r.body.user.password_hash, undefined);
  },
);
await check("Customer cannot enter administrator endpoints", async () =>
  assert.equal((await call("/admin/overview")).status, 403),
);
await check("Unavailable services cannot charge wallet", async () => {
  const result = await call(
    "/rent",
    "POST",
    { service: "boostlier-invalid-service-qa" },
    { "Idempotency-Key": randomBytes(12).toString("hex") },
  );
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, "SERVICE_UNAVAILABLE");
  assert.equal((await call("/balance")).body.balance_usd, "0.00");
});
let firstKey, secondKey;
await check("API key rotation invalidates old credentials", async () => {
  const first = await call("/api-keys", "POST", { password });
  firstKey = first.body.key;
  assert.equal(
    (await call("/api/v1/history", "GET", undefined, { "X-API-Key": firstKey }))
      .status,
    200,
  );
  secondKey = (await call("/api-keys", "POST", { password })).body.key;
  assert.equal(
    (await call("/api/v1/history", "GET", undefined, { "X-API-Key": firstKey }))
      .status,
    401,
  );
  assert.equal(
    (
      await call("/api/v1/history", "GET", undefined, {
        "X-API-Key": secondKey,
      })
    ).status,
    200,
  );
});
await check(
  "Number API lists services and provides a live USD quote",
  async () => {
    const headers = { "X-API-Key": secondKey };
    const services = await call("/api/v1/prices", "GET", undefined, headers);
    assert.equal(services.status, 200);
    assert.ok(services.body.services.length > 100);
    const quote = await call(
      "/api/v1/prices?service=google",
      "GET",
      undefined,
      headers,
    );
    assert.equal(quote.status, 200);
    assert.equal(quote.body.currency, "USD");
    assert.match(quote.body.items[0].price_usd, /^\d+\.\d{2}$/);
    assert.equal((await call("/balance")).body.balance_usd, "0.00");
  },
);
await check(
  "Invalid and forged payment verification cannot credit funds",
  async () => {
    assert.equal(
      (await call("/payments/verify", "POST", { reference: "not-a-payment" }))
        .status,
      404,
    );
    assert.equal((await call("/balance")).body.balance_usd, "0.00");
  },
);
await check("Cross-origin writes are rejected", async () =>
  assert.equal(
    (
      await call(
        "/profile",
        "PATCH",
        { name: "Intruder" },
        { Origin: "https://untrusted.invalid" },
      )
    ).status,
    403,
  ),
);
await check(
  "Support validates real file content and enforces cooldown",
  async () => {
    function form(fake = false) {
      const f = new FormData();
      f.set("email", email);
      f.set("issue_type", "Missing wallet credit");
      f.set("payment_reference", "qa-unpaid-reference");
      f.set("description", "Local QA only: no real payment was made.");
      f.set(
        "receipt",
        fake
          ? new Blob(["not an image"], { type: "image/png" })
          : new Blob([readFileSync("public/social-preview.png")], {
              type: "image/png",
            }),
        "receipt.png",
      );
      return f;
    }
    const invalid = await fetch(origin + "/api/backend/support", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form(true),
    });
    assert.equal(invalid.status, 422);
    const valid = await fetch(origin + "/api/backend/support", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form(),
    });
    assert.equal(valid.status, 200);
    const duplicate = await fetch(origin + "/api/backend/support", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form(),
    });
    assert.equal(duplicate.status, 429);
  },
);
await check("Logout destroys session and password sign-in works", async () => {
  await call("/auth/logout", "POST", {});
  assert.equal((await call("/auth/me")).status, 401);
  assert.equal(
    (await call("/auth/signin", "POST", { email, password })).status,
    200,
  );
  await call("/auth/logout", "POST", {});
});
await check("OpenAPI spec contains all 34 service operations", async () => {
  const spec = await (await fetch(origin + "/openapi.json")).json();
  assert.equal(Object.values(spec.paths).flatMap(Object.values).length, 34);
  assert.equal(spec.components.securitySchemes.ApiKey.name, "X-API-Key");
});
console.log(`${passed} HTTP checks passed`);

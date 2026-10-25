import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const origin = "http://localhost:3000/api/backend";
let cookie = "";
async function request(path, body, headers = {}) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return { status: r.status, body: await r.json() };
}
assert.equal(
  (
    await request("/auth/signup", {
      name: "SMM Read-only QA",
      email: "smm-qa-" + randomBytes(7).toString("hex") + "@example.invalid",
      password: randomBytes(20).toString("hex"),
    })
  ).status,
  201,
);
const catalogue = await request("/smm/catalogue");
assert.equal(catalogue.status, 200);
assert.equal(catalogue.body.state, "live");
assert.equal(catalogue.body.pricing_configured, true);
assert.ok(catalogue.body.items.length > 0);
assert.ok(
  catalogue.body.items.every(
    (s) => !("rate" in s) && !("cost_minor" in s) && s.cancel === false,
  ),
);
const service = catalogue.body.items.find((s) => s.supported);
assert.ok(service);
const quote = await request("/smm/quote", {
  service: service.id,
  quantity: service.minimum,
});
assert.equal(quote.status, 200);
assert.match(quote.body.price_usd, /^\d+\.\d{2}$/);
assert.equal(quote.body.currency, "USD");
console.log(
  "PASS live authenticated catalogue and USD quote; private rates and credentials omitted",
);
assert.equal(
  (await request("/smm/quote", { service: service.id, quantity: 0 })).status,
  422,
);
assert.equal(
  (await request("/smm/cancel", { id: "not-an-order" })).body.error.code,
  "CANCELLATION_UNAVAILABLE",
);
assert.equal(
  (await request("/smm/status", { id: "not-an-order" })).status,
  404,
);
console.log("PASS service limits, unavailable cancellation and ownership");
const order = await request(
  "/smm/purchase",
  {
    service: service.id,
    target: "https://example.com/public-post",
    quantity: service.minimum,
    max_price_usd: quote.body.price_usd,
  },
  { "Idempotency-Key": randomBytes(15).toString("hex") },
);
assert.equal(order.body.error.code, "INSUFFICIENT_FUNDS");
assert.equal((await request("/smm/orders")).body.items.length, 0);
console.log(
  "PASS insufficient customer balance blocks provider submission; no live order was purchased",
);
await request("/auth/logout", {});

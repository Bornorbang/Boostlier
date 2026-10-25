import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { rmSync, writeFileSync } from "node:fs";
const db = resolve(`artifacts/admin-qa-api-all-${Date.now()}.sqlite`);
const env = {
  ...process.env,
  DB_DSN: `sqlite:${db}`,
  APP_ENV: "testing",
  APP_URL: "http://localhost:3000",
  API_REQUESTS_PER_MINUTE: "1000",
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
  ["-S", "127.0.0.1:8881", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
const base = "http://127.0.0.1:8881";
const results = [];
let key;
async function request(
  path,
  { method = "GET", body, idem, auth = true, session } = {},
) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(auth && key ? { "X-API-Key": key } : {}),
      ...(session ? { Cookie: `tn_session=${session}` } : {}),
      ...(idem ? { "Idempotency-Key": idem } : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  const type = res.headers.get("content-type");
  return {
    status: res.status,
    type,
    data: type?.includes("json")
      ? await res.json()
      : Buffer.from(await res.arrayBuffer()),
  };
}
async function test(method, path, body, status = 200, code, extra = {}) {
  const r = await request("/api/v1" + path, { method, body, ...extra });
  assert.equal(
    r.status,
    status,
    `${method} ${path}: ${JSON.stringify(r.data)}`,
  );
  if (code)
    assert.equal(
      r.data.error?.code,
      code,
      `${path}: ${JSON.stringify(r.data)}`,
    );
  results.push({ method, path, status, code: code ?? null });
  console.log(`PASS ${method} ${path} (${status}${code ? " " + code : ""})`);
  return r.data;
}
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  key = (
    await request("/api-keys", {
      method: "POST",
      session: f.customer.token,
      body: {},
    })
  ).data.key;
  assert(key);
  const spec = await (await fetch("http://localhost:3000/openapi.json")).json();
  let protectedCount = 0;
  for (const [path, methods] of Object.entries(spec.paths))
    for (const method of Object.keys(methods)) {
      const r = await request(path, {
        method: method.toUpperCase(),
        auth: false,
        ...(method === "post" ? { body: {} } : {}),
      });
      assert.equal(r.status, 401, `${method} ${path} authentication`);
      protectedCount++;
    }
  assert.equal(protectedCount, 34);
  for (const path of [
    "/numbers/services",
    "/prices",
    "/global-numbers/countries",
    "/global-numbers/services",
    "/global-numbers/prices?service=facebook",
    "/rentals",
    "/history",
    "/number-rentals/catalogue",
    "/number-rentals",
    "/smm/catalogue",
    "/smm/orders",
    "/temp-mail",
  ])
    await test("GET", path);
  await test(
    "POST",
    "/numbers/quote",
    { service: "facebook" },
    503,
    "PROVIDER_UNAVAILABLE",
  );
  await test(
    "GET",
    "/prices?service=facebook",
    undefined,
    503,
    "PROVIDER_UNAVAILABLE",
  );
  await test(
    "POST",
    "/rent",
    { service: "facebook", catalogue: "usa", max_price_usd: "5.00" },
    503,
    "PROVIDER_UNAVAILABLE",
    { idem: "usa-purchase-qa" },
  );
  await test("POST", "/status", { rental_id: f.number });
  await test("POST", "/status", { rental_id: f.global });
  await test("POST", "/cancel", { rental_id: f.global }); // Completed orders remain completed.
  await test(
    "POST",
    "/finish",
    { rental_id: f.number },
    422,
    "INVALID_PRODUCT",
  );
  await test(
    "POST",
    "/number-rentals/quote",
    { service: "facebook", duration: "sevenDay" },
    503,
    "PROVIDER_UNAVAILABLE",
  );
  await test(
    "POST",
    "/number-rentals/purchase",
    { service: "facebook", duration: "sevenDay", max_price_usd: "5.00" },
    503,
    "PROVIDER_UNAVAILABLE",
    { idem: "long-term-buy-qa" },
  );
  await test(
    "POST",
    "/number-rentals/extend",
    { id: f.rental, duration: "sevenDay", max_price_usd: "5.00" },
    503,
    "PROVIDER_UNAVAILABLE",
    { idem: "long-term-extend-qa" },
  );
  await test(
    "POST",
    "/number-rentals/status",
    { id: f.rental },
    503,
    "PROVIDER_UNAVAILABLE",
  );
  await test(
    "POST",
    "/number-rentals/cancel",
    { id: f.rental },
    503,
    "PROVIDER_UNAVAILABLE",
  );
  await test(
    "GET",
    `/number-rentals/messages?id=${f.rental}`,
    undefined,
    503,
    "PROVIDER_UNAVAILABLE",
  );
  await test("POST", "/number-rentals/recover", { id: f.operation });
  const quote = await test("POST", "/smm/quote", {
    service: "101",
    quantity: 1000,
  });
  assert.equal(quote.price_usd, "2.00");
  await test(
    "POST",
    "/smm/purchase",
    {
      service: "101",
      quantity: 1000,
      target: "https://example.com/profile",
      max_price_usd: "2.00",
    },
    503,
    "PROVIDER_UNAVAILABLE",
    { idem: "smm-purchase-qa" },
  );
  await test("POST", "/smm/status", { id: f.social });
  await test("POST", "/smm/refill-status", { id: f.refill });
  const refill = await test("POST", "/smm/refill", { id: f.social });
  assert.equal(refill.status, "reconciliation");
  const before = (
    await request("/balance", { auth: false, session: f.customer.token })
  ).data;
  const create = await test(
    "POST",
    "/temp-mail/create",
    { max_price_usd: "1.00" },
    200,
    undefined,
    { idem: "mail-create-qa" },
  );
  assert.equal(create.status, "rejected");
  assert.equal(create.error_code, "TEMP_MAIL_UNCONFIGURED");
  const after = (
    await request("/balance", { auth: false, session: f.customer.token })
  ).data;
  assert.deepEqual(
    after,
    before,
    "Failed inbox generation must release reserved funds",
  );
  await test(
    "GET",
    `/temp-mail/messages?inbox_id=${f.inbox}`,
    undefined,
    503,
    "TEMP_MAIL_UNCONFIGURED",
  );
  await test(
    "GET",
    `/temp-mail/message?inbox_id=${f.inbox}&message_id=message-1`,
    undefined,
    503,
    "TEMP_MAIL_UNCONFIGURED",
  );
  const renewal = await test(
    "POST",
    "/temp-mail/renew",
    { id: f.inbox, max_price_usd: "1.00" },
    200,
    undefined,
    { idem: "mail-renew-qa" },
  );
  assert.equal(renewal.status, "completed");
  await test(
    "POST",
    "/temp-mail/renew",
    { id: f.inbox, max_price_usd: "1.00" },
    200,
    undefined,
    { idem: "mail-renew-qa" },
  );
  assert.equal(
    (await request("/balance", { auth: false, session: f.customer.token })).data
      .balance_usd,
    (Number(before.balance_usd) - 1).toFixed(2),
    "Renewal replay charges once",
  );
  await test("POST", "/temp-mail/delete", { id: f.inbox, confirmed: true });
  await test(
    "GET",
    `/temp-mail/messages?inbox_id=${f.inbox}`,
    undefined,
    404,
    "NOT_FOUND",
  );
  const covered = new Set(
    results.map((r) => r.method + " /api/v1" + r.path.split("?")[0]),
  );
  for (const [path, methods] of Object.entries(spec.paths))
    for (const method of Object.keys(methods))
      assert(
        covered.has(method.toUpperCase() + " " + path),
        "Not covered: " + method + " " + path,
      );
  writeFileSync(
    "artifacts/api-endpoint-audit.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        authenticatedEndpoints: protectedCount,
        coverage: covered.size,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `All ${protectedCount} documented operations authenticated and dispatched; ${results.length} endpoint scenarios passed.`,
  );
} finally {
  server.kill();
  await new Promise((r) => server.once("exit", r));
  execFileSync(
    "C:/php/php.exe",
    [
      "-r",
      `require 'backend/src/bootstrap.php'; foreach(array_merge(TempNumber\\all("SELECT banner_file AS file FROM ads WHERE banner_file<>'qa.png'"),TempNumber\\all("SELECT attachment AS file FROM support_tickets WHERE attachment<>'qa.png'")) as $r){$p='backend/storage/'.basename($r['file']);if(is_file($p))unlink($p);}`,
    ],
    { env },
  );
  rmSync(db, { force: true });
}

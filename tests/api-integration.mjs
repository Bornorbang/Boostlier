import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
const db = resolve(`artifacts/admin-qa-api-${Date.now()}.sqlite`);
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
const fixture = JSON.parse(
  execFileSync("C:/php/php.exe", ["tests/admin-fixture.php"], {
    env,
    encoding: "utf8",
  }),
);
const server = spawn(
  "C:/php/php.exe",
  ["-S", "127.0.0.1:8878", "backend/public/index.php"],
  { env, windowsHide: true, stdio: "ignore" },
);
const base = "http://127.0.0.1:8878";
let passed = 0;
async function call(
  path,
  { key, session, body, method = body ? "POST" : "GET", origin } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(key ? { "X-API-Key": key } : {}),
      ...(session ? { Cookie: `tn_session=${session}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
function check(name, fn) {
  fn();
  passed++;
  console.log("PASS " + name);
}
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const session = fixture.customer.token;
  let r = await call("/api-keys", { session, body: {} });
  const key = r.data.key;
  check("generate without password", () => {
    assert.equal(r.status, 200);
    assert.match(key, /^tn_/);
  });
  r = await call("/api/v1/history", { key });
  check("key authenticates service history", () => {
    assert.equal(r.status, 200);
    assert(Array.isArray(r.data.items));
  });
  for (const path of [
    "/temp-mail",
    "/smm/orders",
    "/number-rentals",
    "/history",
    "/rentals?product=global",
  ]) {
    r = await call("/api/v1" + path, { key });
    check("exposes " + path, () => assert.equal(r.status, 200));
  }
  r = await call("/api/v1/status", {
    key,
    body: { rental_id: fixture.number },
  });
  check("reads completed USA order with leading zeros", () =>
    assert.equal(r.data.sms_code, "001234"),
  );
  r = await call("/api/v1/cancel", {
    key,
    body: { rental_id: fixture.rental },
  });
  check("verification cancellation cannot act on long-term rentals", () =>
    assert.equal(r.data.error.code, "INVALID_PRODUCT"),
  );
  const adminKey = (
    await call("/api-keys", { session: fixture.admin.token, body: {} })
  ).data.key;
  for (const [path, body] of [
    ["/status", { rental_id: fixture.number }],
    ["/number-rentals/status", { id: fixture.rental }],
    ["/temp-mail/messages", null],
    ["/smm/status", { id: fixture.number }],
  ]) {
    r = await call(
      "/api/v1" +
        path +
        (path === "/temp-mail/messages" ? `?inbox_id=${fixture.inbox}` : ""),
      { key: adminKey, ...(body ? { body } : {}) },
    );
    check("cross-account blocked " + path, () => assert.equal(r.status, 404));
  }
  for (const path of [
    "/api/v1/api-keys",
    "/api/v1/admin/users",
    "/api/v1/profile/change-password",
    "/api/v1/dedicated/catalogue",
  ]) {
    r = await call(path, { key });
    check("private route blocked " + path, () => assert.equal(r.status, 404));
  }
  r = await call("/api-keys", {
    session,
    body: {},
    origin: "https://untrusted.example",
  });
  check("rotation rejects foreign origin", () => assert.equal(r.status, 403));
  const rotated = await call("/api-keys", { session, body: {} });
  const nextKey = rotated.data.key;
  r = await call("/api/v1/history", { key });
  check("rotation invalidates old key", () => assert.equal(r.status, 401));
  r = await call("/api/v1/history", { key: nextKey });
  check("replacement key works", () => assert.equal(r.status, 200));
  const keys = (await call("/api-keys", { session })).data.items;
  check("one active key and no raw secrets returned", () => {
    assert.equal(keys.filter((k) => !k.revoked_at).length, 1);
    assert(!JSON.stringify(keys).includes(nextKey));
  });
  for (const [method, path] of [
    ["GET", "/balance"],
    ["GET", "/wallet"],
    ["GET", "/profile"],
    ["GET", "/announcements"],
    ["GET", "/rewards"],
    ["POST", "/rewards/claim"],
    ["GET", "/ads"],
    ["GET", "/ads/banner"],
    ["POST", "/ads/create"],
    ["POST", "/ads/remove"],
    ["GET", "/support"],
    ["POST", "/support"],
    ["POST", "/payments/checkout"],
    ["POST", "/payments/verify"],
  ]) {
    r = await call("/api/v1" + path, {
      key: nextKey,
      method,
      ...(method === "POST" ? { body: {} } : {}),
    });
    check("app-only endpoint removed " + method + " " + path, () =>
      assert.equal(r.status, 404),
    );
  }
  r = await call("/api/v1/temp-mail/create", { key: nextKey, body: {} });
  check("API purchase requires idempotency", () =>
    assert.equal(r.data.error.code, "IDEMPOTENCY_REQUIRED"),
  );
  await call("/api-keys", {
    session,
    method: "DELETE",
    body: { id: keys.find((k) => !k.revoked_at).id },
  });
  r = await call("/api/v1/history", { key: nextKey });
  check("revoke invalidates current key", () => assert.equal(r.status, 401));
  console.log(`${passed} API integration checks passed`);
} finally {
  server.kill();
  await new Promise((r) => server.once("exit", r));
  rmSync(db, { force: true });
}

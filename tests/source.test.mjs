import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
test("Private route groups emit server-owned noindex metadata", () => {
  for (const path of [
    "dashboard/layout.tsx",
    "admin/layout.tsx",
    "auth/[action]/page.tsx",
    "boost-account/layout.tsx",
    "payment/return/page.tsx",
  ])
    assert.match(readFileSync("src/app/" + path, "utf8"), /index:\s*false/);
});
test("Declared currency and locale remain British", () => {
  const config = readFileSync("src/lib/config.ts", "utf8");
  assert.match(config, /en-GB/);
  assert.match(config, /Europe\/London/);
  assert.match(config, /currency:\s*["']USD["']/);
});
test("Provider credentials are not referenced by frontend source", () => {
  for (const file of [
    "src/lib/api.ts",
    "src/lib/config.ts",
    "src/components/dashboard.tsx",
  ])
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /GETATEXT_API_KEY|FIVESIM_API_KEY|STRIPE_SECRET_KEY|SMTP_PASSWORD/,
    );
});
test("All required artefacts are present", () => {
  for (const file of [
    "backend/migrations/001_core.sql",
    "backend/.env.example",
    ".env.example",
    "public/icon.svg",
    "public/social-preview.svg",
    "src/app/openapi.json/route.ts",
    "backend/bin/jobs.php",
  ])
    assert.ok(existsSync(file), file);
});

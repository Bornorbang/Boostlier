import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const routes = [
  "/",
  "/social-boosting",
  "/numbers",
  "/pricing",
  "/long-term-rentals",
  "/temporary-email",
  "/developers",
  "/faq",
  "/ads",
  "/legal/terms",
  "/legal/privacy",
  "/services/whatsapp",
  "/services/telegram",
  "/services/google",
];
const checks = [];
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext();
    await context.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        const r = await page.goto("http://localhost:3000" + route, {
          waitUntil: "domcontentloaded",
        });
        assert.equal(r.status(), 200);
        await page.locator("h1").waitFor();
        assert.equal(await page.locator("h1").count(), 1);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route} overflows at ${width}`,
        );
        assert.equal(
          await page.locator('footer a[href="/dedicated-numbers"]').count(),
          0,
        );
        assert.equal(
          await page.locator('footer a[href="/boost-account/orders"]').count(),
          0,
        );
        checks.push({ route, width, theme });
        if (
          theme === "light" &&
          ["/numbers", "/ads", "/pricing"].includes(route)
        )
          await page.screenshot({
            path: `artifacts/public-${route.slice(1)}-${width}.png`,
            fullPage: true,
          });
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  writeFileSync(
    "artifacts/public-redesign-checks.json",
    JSON.stringify(checks, null, 2),
  );
  console.log(
    `PASS ${checks.length} public page/theme/viewport checks; no horizontal overflow or runtime errors`,
  );
} finally {
  await browser.close();
}

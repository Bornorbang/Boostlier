import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const origin = "http://localhost:3000";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--disable-gpu"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => {
    assert.ok(
      !req.url().includes("rapidapi.com"),
      "Provider traffic must stay on backend",
    );
    assert.ok(
      !JSON.stringify(req.headers()).toLowerCase().includes("x-rapidapi-key"),
    );
  });
  assert.equal(
    (
      await context.request.get(origin + "/api/temp-mail?action=status")
    ).status(),
    401,
  );
  const email = `temp-mail-browser-${Date.now()}@example.invalid`;
  await page.goto(origin + "/auth/signup");
  await page
    .getByRole("textbox", { name: "Your name" })
    .fill("Temporary Email QA");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page
    .getByLabel(/^Password/)
    .fill("Test-only-" + Date.now() + "-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  await page.goto(origin + "/dashboard/temp-mail");
  await page
    .getByRole("heading", { name: "Temporary Emails", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Generate email", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "insufficient" }).waitFor();
  execFileSync("C:/php/php.exe", [
    "backend/tests/temp-mail-browser-fixture.php",
    "fund",
    email,
  ]);
  await page.reload();
  await page
    .locator(".balance-chip")
    .getByText("$5.00", { exact: false })
    .waitFor();
  assert.equal(await page.locator(".temp-mail-overview > .panel").count(), 2);
  assert.equal(
    await page.getByText("Available wallet balance", { exact: true }).count(),
    0,
  );
  const cards = await page.locator(".temp-mail-overview > .panel").all();
  const left = await cards[0].boundingBox();
  const right = await cards[1].boundingBox();
  assert.ok(right.x > left.x && Math.abs(right.y - left.y) < 2);
  assert.ok(Math.abs(left.width - right.width) < 2);
  const createRequest = page.waitForRequest(
    (req) => req.url().includes("action=create") && req.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Generate email", exact: true })
    .click();
  const create = await createRequest;
  await page.getByRole("button", { name: "Messages", exact: true }).waitFor();
  let status = await (
    await context.request.get(origin + "/api/temp-mail?action=status")
  ).json();
  assert.equal(status.price_usd, "1.00");
  assert.equal(status.items.length, 1);
  assert.equal(status.balance_usd, "4.00");
  const inbox = status.items[0];
  assert.ok(inbox.address.includes("@"));
  assert.equal(status.items[0].provider_id, undefined);
  const replay = await context.request.post(create.url(), {
    headers: { "Idempotency-Key": create.headers()["idempotency-key"] },
    data: create.postDataJSON(),
  });
  assert.equal((await replay.json()).inbox_id, inbox.id);
  await page
    .locator(".balance-chip")
    .getByText("$4.00", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    inbox.address,
  );
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page
    .getByRole("heading", { name: "No messages yet", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close inbox" }).click();
  // Synthetic received-message fixtures exercise the modal without sending outgoing mail.
  let mailMode = "message";
  await page.route("**/api/temp-mail?**", async (route) => {
    const url = new URL(route.request().url());
    if (!["messages", "message"].includes(url.searchParams.get("action")))
      return route.continue();
    if (mailMode === "error")
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "TEMP_MAIL_PROVIDER_ERROR",
            message: "Provider unavailable for QA",
          },
        },
      });
    const fixture = {
      id: "message-qa",
      sender: "sender@example.com",
      subject: "Your confirmation",
      preview: "Code preview",
      text: "Your code is 001234.\n<script>literal text only</script>",
    };
    return route.fulfill({
      json:
        url.searchParams.get("action") === "messages"
          ? { items: [fixture] }
          : fixture,
    });
  });
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page
    .getByRole("button", { name: /sender@example.com.*Your confirmation/ })
    .click();
  await page.locator(".temp-mail-content pre").waitFor();
  assert.match(
    await page.locator(".temp-mail-content pre").innerText(),
    /001234/,
  );
  assert.equal(await page.locator(".temp-mail-content script").count(), 0);
  await page.screenshot({
    path: "artifacts/temp-mail-message.png",
    fullPage: true,
  });
  mailMode = "error";
  await page.getByRole("button", { name: "Refresh inbox", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "Provider unavailable" })
    .waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "No messages yet" }).count(),
    0,
  );
  await page.getByRole("button", { name: "Close inbox" }).click();
  await page.unroute("**/api/temp-mail?**");
  const renewRequest = page.waitForRequest(
    (req) => req.url().includes("action=renew") && req.method() === "POST",
  );
  await page.getByRole("button", { name: /^Renew/ }).click();
  const renew = await renewRequest;
  await page
    .locator(".balance-chip")
    .getByText("$3.00", { exact: false })
    .waitFor();
  await context.request.post(renew.url(), {
    headers: { "Idempotency-Key": renew.headers()["idempotency-key"] },
    data: renew.postDataJSON(),
  });
  status = await (
    await context.request.get(origin + "/api/temp-mail?action=status")
  ).json();
  assert.equal(status.balance_usd, "3.00");
  assert.equal(status.items[0].address, inbox.address);
  assert.equal(
    new Date(status.items[0].expires_at) - new Date(inbox.expires_at),
    86400000,
  );
  assert.equal(
    (
      await context.request.post(
        origin + "/api/temp-mail?action=delete&id=" + inbox.id,
        { data: {} },
      )
    ).status(),
    422,
  );
  await page.screenshot({
    path: "artifacts/temp-mail-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle colour theme" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/temp-mail-mobile-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Keep inbox" }).click();
  assert.equal(
    (
      await (
        await context.request.get(origin + "/api/temp-mail?action=status")
      ).json()
    ).items.length,
    1,
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete inbox", exact: true }).click();
  await page
    .getByText(
      "Generate an address to receive temporary emails. Your addresses and expiry times will appear here.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (
      await context.request.get(
        origin + "/api/temp-mail?action=messages&inbox_id=" + inbox.id,
      )
    ).status(),
    404,
  );
  assert.equal(
    (
      await context.request.post(
        origin + "/api/temp-mail?action=renew&id=" + inbox.id,
        { data: {}, headers: { "Idempotency-Key": crypto.randomUUID() } },
      )
    ).status(),
    404,
  );
  await page
    .getByRole("button", { name: "Generate email", exact: true })
    .click();
  await page.getByRole("button", { name: "Messages", exact: true }).waitFor();
  status = await (
    await context.request.get(origin + "/api/temp-mail?action=status")
  ).json();
  const expired = status.items[0];
  execFileSync("C:/php/php.exe", [
    "backend/tests/temp-mail-browser-fixture.php",
    "expire",
    email,
    expired.id,
  ]);
  await page.reload();
  await page
    .getByText(
      "Generate an address to receive temporary emails. Your addresses and expiry times will appear here.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Messages", exact: true }).count(),
    0,
  );
  assert.equal(
    (
      await context.request.get(
        origin +
          "/api/temp-mail?action=message&inbox_id=" +
          expired.id +
          "&message_id=not-owned",
      )
    ).status(),
    410,
  );
  const after = await (
    await context.request.get(origin + "/api/temp-mail?action=status")
  ).json();
  assert.equal(after.balance_usd, "2.00");
  assert.deepEqual(errors, []);
  console.log(
    "PASS temporary email: authenticated live generation, $1.00 charges, idempotent create/renew, shared balance, copy, live empty inbox, fixture message/error modal, delete confirmation/revocation, expiry, themes and mobile layout",
  );
} finally {
  await browser.close();
}

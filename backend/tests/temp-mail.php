<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:'); putenv('APP_ENV=testing'); putenv('TEMP_MAIL_PRICE_CENTS=70');
require __DIR__ . '/../src/bootstrap.php';
require __DIR__ . '/../src/Wallet.php';
require __DIR__ . '/../src/TempMail.php';
foreach (glob(__DIR__ . '/../migrations/*.sql') as $file) db()->exec(file_get_contents($file));
query("DELETE FROM settings WHERE name='service_prices'");
$passed = 0;
function eq(mixed $actual, mixed $expected): void { if ($actual !== $expected) throw new \RuntimeException(var_export($actual, true) . ' !== ' . var_export($expected, true)); }
function test(string $name, callable $fn): void { global $passed; $fn(); $passed++; echo "PASS $name\n"; }
function rejects(callable $fn, string $code): void { try { $fn(); } catch (Problem $e) { eq($e->key, $code); return; } throw new \RuntimeException('Expected ' . $code); }
function customer(int $funds = 1000): array {
    $id = id(); query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)', [$id, 'Mail QA', $id . '@example.invalid', 'unused', id(), now()]);
    query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,?)', [$id, $funds]); return ['id' => $id];
}
function provider(): TempMailProvider { return new TempMailProvider(fn() => ['@example.com']); }
function createInbox(array $user): array { $result = TempMail::create($user, ['max_price_usd' => '0.70'], id(), provider()); return one('SELECT * FROM inboxes WHERE id=?', [$result['inbox_id']]); }
function fixture(string $id = 'message-1'): array { return ['mail_id' => $id, 'mail_from' => 'sender@example.com', 'mail_subject' => '<b>Hello</b>', 'mail_preview' => 'Preview', 'mail_html' => '<p>Hello</p><script>alert(1)</script><p>World &amp; everyone</p>']; }

test('Domain list uses exact current endpoint and normalises domains', function () {
    $p = new TempMailProvider(function ($path) { eq($path, '/request/domains/'); return ['@Example.com', '@example.com', 'bad@domain', 'localhost']; });
    eq($p->domains(), ['example.com']);
});
test('Invalid or empty provider domains remain errors', function () {
    rejects(fn() => (new TempMailProvider(fn() => []))->domains(), 'TEMP_MAIL_PROVIDER_ERROR');
    rejects(fn() => (new TempMailProvider(fn() => ['error' => 'Unavailable']))->domains(), 'TEMP_MAIL_PROVIDER_ERROR');
});
test('Create charges configured USD price and stores owner, MD5 identifier and 24-hour expiry', function () {
    $u = customer(); $start = time(); $row = createInbox($u);
    eq($row['user_id'], $u['id']); eq($row['provider_id'], md5($row['address'])); eq((int)$row['price_cents'], 70);
    eq($row['status'], 'active'); eq(Wallet::balance($u['id'])['balance_usd'], '9.30'); eq(Wallet::balance($u['id'])['reserved_usd'], '0.00');
    if (abs(strtotime($row['expires_at']) - $start - 86400) > 2) throw new \RuntimeException('Incorrect expiry');
});
test('Create replay returns same inbox and one charge', function () {
    $u = customer(); $key = id(); $calls = 0; $p = new TempMailProvider(function () use (&$calls) { $calls++; return ['@example.com']; });
    $a = TempMail::create($u, [], $key, $p); $b = TempMail::create($u, [], $key, $p);
    eq($a, $b); eq($calls, 1); eq(Wallet::balance($u['id'])['balance_usd'], '9.30');
    eq((int)one("SELECT COUNT(*) n FROM ledger WHERE user_id=? AND kind='purchase'", [$u['id']])['n'], 1);
});
test('Interrupted generation resumes the same reservation without a duplicate charge', function () {
    $u = customer(); $key = id(); $operation = id();
    tx(function () use ($u, $key, $operation) {
        Wallet::change($u['id'], 'reservation', 0, 'temp-mail-reserve:' . $operation, 'Interrupted create', 70);
        query('INSERT INTO temp_mail_operations (id,user_id,idempotency_key,operation,request_hash,price_cents,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
            [$operation, $u['id'], $key, 'create', hash('sha256', json_encode(['create', null])), 70, 'pending', now(), now()]);
    });
    $result = TempMail::recover($operation, provider()); eq(TempMail::recover($operation, provider()), $result); eq(TempMail::create($u, [], $key, provider()), $result); eq($result['id'], $operation); eq($result['status'], 'completed');
    eq(Wallet::balance($u['id'])['balance_usd'], '9.30'); eq(Wallet::balance($u['id'])['reserved_usd'], '0.00');
});

test('Idempotency key cannot be reused with a different price cap or operation', function () {
    $u = customer(); $key = id(); $result = TempMail::create($u, [], $key, provider());
    rejects(fn() => TempMail::create($u, ['max_price_usd' => '0.70'], $key, provider()), 'IDEMPOTENCY_CONFLICT');
    rejects(fn() => TempMail::renew($u, $result['inbox_id'], [], $key), 'IDEMPOTENCY_CONFLICT');
});
test('Definite generation failure releases reserved funds once across retries', function () {
    $u = customer(); $key = id(); $p = new TempMailProvider(fn() => ['error' => 'Failed']);
    $result = TempMail::create($u, [], $key, $p); eq($result['status'], 'rejected');
    eq(TempMail::create($u, [], $key, provider()), $result);
    eq(Wallet::balance($u['id'])['balance_usd'], '10.00'); eq(Wallet::balance($u['id'])['reserved_usd'], '0.00');
    eq((int)one("SELECT COUNT(*) n FROM ledger WHERE user_id=? AND kind='release'", [$u['id']])['n'], 1);
    eq((int)one('SELECT COUNT(*) n FROM inboxes WHERE user_id=?', [$u['id']])['n'], 0);
});
test('Insufficient funds stop creation before a provider request', function () {
    $u = customer(69); $calls = 0; $p = new TempMailProvider(function () use (&$calls) { $calls++; return ['@example.com']; });
    rejects(fn() => TempMail::create($u, [], id(), $p), 'INSUFFICIENT_FUNDS'); eq($calls, 0);
});
test('Price caps are enforced server-side and missing price disables purchases', function () {
    $u = customer(); rejects(fn() => TempMail::create($u, ['max_price_usd' => '0.69'], id(), provider()), 'PRICE_EXCEEDS_MAX');
    putenv('TEMP_MAIL_PRICE_CENTS='); eq(TempMail::listing($u)['price_usd'], null);
    rejects(fn() => TempMail::create($u, [], id(), provider()), 'PRICING_UNCONFIGURED'); putenv('TEMP_MAIL_PRICE_CENTS=70');
});
test('Renew extends same active inbox from its existing expiry and replay charges once', function () {
    $u = customer(); $row = createInbox($u); $key = id(); $input = ['expires_at' => str_replace(' ', 'T', $row['expires_at']) . 'Z'];
    $a = TempMail::renew($u, $row['id'], $input, $key); eq(TempMail::renew($u, $row['id'], $input, $key), $a);
    $renewed = one('SELECT * FROM inboxes WHERE id=?', [$row['id']]); eq($row['address'], $renewed['address']); eq($row['provider_id'], $renewed['provider_id']);
    eq(strtotime($renewed['expires_at']) - strtotime($row['expires_at']), 86400); eq(Wallet::balance($u['id'])['balance_usd'], '8.60');
    rejects(fn() => TempMail::renew($u, $row['id'], $input, id()), 'INBOX_CHANGED');
});
test('Renew uses current configurable price and insufficient funds leave expiry unchanged', function () {
    $u = customer(100); $row = createInbox($u); putenv('TEMP_MAIL_PRICE_CENTS=80');
    rejects(fn() => TempMail::renew($u, $row['id'], [], id()), 'INSUFFICIENT_FUNDS');
    eq(one('SELECT expires_at FROM inboxes WHERE id=?', [$row['id']])['expires_at'], $row['expires_at']); putenv('TEMP_MAIL_PRICE_CENTS=70');
});
test('Ownership is checked on inbox read, message read, renewal and deletion', function () {
    $u = customer(); $other = customer(); $row = createInbox($u);
    rejects(fn() => TempMail::messages($other, $row['id'], null, provider()), 'NOT_FOUND');
    rejects(fn() => TempMail::messages($other, $row['id'], 'message-1', provider()), 'NOT_FOUND');
    rejects(fn() => TempMail::renew($other, $row['id'], [], id()), 'NOT_FOUND');
    rejects(fn() => TempMail::delete($other, $row['id'], true), 'NOT_FOUND');
});
test('Expired inboxes cannot read messages or renew and display as expired', function () {
    $u = customer(); $row = createInbox($u); query('UPDATE inboxes SET expires_at=? WHERE id=?', [now(), $row['id']]);
    rejects(fn() => TempMail::messages($u, $row['id'], null, provider()), 'INBOX_EXPIRED');
    rejects(fn() => TempMail::messages($u, $row['id'], 'message-1', provider()), 'INBOX_EXPIRED');
    rejects(fn() => TempMail::renew($u, $row['id'], [], id()), 'INBOX_EXPIRED');
    eq(TempMail::listing($u)['items'][0]['status'], 'expired');
});
test('Deletion requires confirmation, hides inbox, revokes access and can be safely repeated', function () {
    $u = customer(); $row = createInbox($u); rejects(fn() => TempMail::delete($u, $row['id'], false), 'CONFIRMATION_REQUIRED');
    TempMail::delete($u, $row['id'], true); TempMail::delete($u, $row['id'], true);
    eq(TempMail::listing($u)['items'], []); rejects(fn() => TempMail::messages($u, $row['id'], null, provider()), 'NOT_FOUND');
    rejects(fn() => TempMail::renew($u, $row['id'], [], id()), 'NOT_FOUND'); eq(Wallet::balance($u['id'])['balance_usd'], '9.30');
});
test('Empty inbox is distinct from provider errors', function () {
    $u = customer(); $row = createInbox($u);
    eq(TempMail::messages($u, $row['id'], null, new TempMailProvider(fn() => ['error' => 'There are no emails yet'])), ['items' => []]);
    rejects(fn() => TempMail::messages($u, $row['id'], null, new TempMailProvider(fn() => ['error' => 'Connection failed'])), 'TEMP_MAIL_PROVIDER_ERROR');
});
test('Message lists expose sender, subject and preview, without HTML or full body', function () {
    $u = customer(); $row = createInbox($u); $p = new TempMailProvider(function ($path) use ($row) { eq($path, '/request/mail/id/' . $row['provider_id'] . '/'); return [fixture()]; });
    $message = TempMail::messages($u, $row['id'], null, $p)['items'][0];
    eq($message['sender'], 'sender@example.com'); eq($message['subject'], 'Hello'); eq($message['preview'], 'Preview'); eq(isset($message['text']), false);
});
test('Single-message endpoint verifies membership before retrieving plain text', function () {
    $u = customer(); $row = createInbox($u); $paths = []; $p = new TempMailProvider(function ($path) use (&$paths) { $paths[] = $path; return [fixture()]; });
    $result = TempMail::messages($u, $row['id'], 'message-1', $p); eq($result['text'], "Hello\nWorld & everyone");
    eq($paths[1], '/request/one_mail/id/message-1/');
});
test('Messages outside selected mailbox are denied without a global message lookup', function () {
    $u = customer(); $row = createInbox($u); $calls = 0; $p = new TempMailProvider(function () use (&$calls) { $calls++; return [fixture()]; });
    rejects(fn() => TempMail::messages($u, $row['id'], 'another-message', $p), 'MESSAGE_NOT_FOUND'); eq($calls, 1);
});
test('Message hash mismatch and provider identifier mismatch are denied', function () {
    $u = customer(); $row = createInbox($u);
    $p = new TempMailProvider(fn($path) => str_contains($path, 'one_mail') ? [fixture() + ['mail_address_id' => str_repeat('0', 32)]] : [fixture()]);
    rejects(fn() => TempMail::messages($u, $row['id'], 'message-1', $p), 'MESSAGE_NOT_FOUND');
    $p = new TempMailProvider(fn($path) => str_contains($path, 'one_mail') ? [fixture('different')] : [fixture()]);
    rejects(fn() => TempMail::messages($u, $row['id'], 'message-1', $p), 'MESSAGE_NOT_FOUND');
});
test('Deletion or expiry during remote retrieval revokes the pending response', function () {
    $u = customer(); $row = createInbox($u);
    $p = new TempMailProvider(function () use ($u, $row) { TempMail::delete($u, $row['id'], true); return [fixture()]; });
    rejects(fn() => TempMail::messages($u, $row['id'], null, $p), 'NOT_FOUND');
});
test('Customer status only contains owned inboxes and never provider identifiers', function () {
    $u = customer(); createInbox($u); createInbox(customer()); $result = TempMail::listing($u);
    eq(count($result['items']), 1); eq(isset($result['items'][0]['provider_id']), false); eq($result['price_usd'], '0.70');
    eq(str_ends_with($result['items'][0]['expires_at'], 'Z'), true);
});
echo "$passed temporary email tests passed\n";

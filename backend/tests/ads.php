<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:'); putenv('APP_ENV=testing'); putenv('ADS_PRICE_CENTS=1000');
require __DIR__ . '/../src/bootstrap.php'; require __DIR__ . '/../src/Wallet.php'; require __DIR__ . '/../src/Ads.php';
foreach (glob(__DIR__ . '/../migrations/*.sql') as $file) db()->exec(file_get_contents($file));
query("DELETE FROM settings WHERE name='service_prices'");
$passed = 0; $stored = [];
function eq(mixed $a, mixed $b): void { if ($a !== $b) throw new \RuntimeException(var_export($a, true) . ' !== ' . var_export($b, true)); }
function test(string $name, callable $fn): void { global $passed; $fn(); $passed++; echo "PASS $name\n"; }
function rejects(callable $fn, string $code): void { try { $fn(); } catch (Problem $error) { eq($error->key, $code); return; } throw new \RuntimeException('Expected ' . $code); }
function customer(int $funds = 3000): array {
    $id = id(); query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)', [$id, 'Ads QA', $id . '@example.invalid', 'unused', id(), now()]);
    query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,?)', [$id, $funds]); return ['id' => $id];
}
function input(): array { return ['title' => 'My business', 'target_url' => 'https://example.com/offer', 'max_price_usd' => '10.00','terms_version'=>'2026-10-24']; }
function purchase(array $u, string $banner, ?string $key = null): array {
    global $stored; $result = Ads::create($u, input(), $banner, $key ?? id());
    $row = one('SELECT * FROM ads WHERE id=?', [$result['ad']['id']]); $stored[] = __DIR__ . '/../storage/' . $row['banner_file']; return $result;
}
function chunk(string $name, string $data): string { return pack('N', strlen($data)) . $name . $data . pack('N', crc32($name . $data)); }
$banner = tempnam(sys_get_temp_dir(), 'boostlier-ad-');
file_put_contents($banner, "\x89PNG\r\n\x1a\n" . chunk('IHDR', pack('NNCCCCC', 600, 200, 8, 2, 0, 0, 0)) . chunk('IDAT', gzcompress(str_repeat("\x00" . str_repeat("\x90\xc0\x50", 600), 200))) . chunk('IEND', ''));
try {
test('Banner validation reads actual bytes', function () use ($banner) { eq(Ads::banner($banner)['mime'], 'image/png'); });
test('SVG and fake image uploads are rejected', function () {
    $file = tempnam(sys_get_temp_dir(), 'bad-ad-'); file_put_contents($file, '<svg onload="alert(1)"></svg>');
    try { rejects(fn() => Ads::banner($file), 'INVALID_BANNER'); } finally { unlink($file); }
});
test('One month clamps month-end and leap-year dates in London', function () {
    eq(Ads::expiry(new \DateTimeImmutable('2027-01-31T12:00:00Z')), '2027-02-28 12:00:00');
    eq(Ads::expiry(new \DateTimeImmutable('2028-01-31T12:00:00Z')), '2028-02-29 12:00:00');
    eq(Ads::expiry(new \DateTimeImmutable('2026-03-15T12:00:00Z')), '2026-04-15 11:00:00');
});
test('Invalid/private/non-HTTP targets are rejected', function () {
    foreach (['javascript:alert(1)', 'http://localhost', 'http://127.0.0.1/post', 'https://user:pass@example.com', 'http://test.local'] as $url) rejects(fn() => Ads::target($url), 'INVALID_TARGET');
});
test('Publishing charges USD 10.00 and immediately lists the ad', function () use ($banner) {
    $u = customer(); $result = purchase($u, $banner); eq($result['status'], 'completed'); eq($result['ad']['mine'], true);
    eq($result['ad']['price_usd'], '10.00'); eq(Wallet::balance($u['id'])['balance_usd'], '20.00');
    eq(Ads::listing($u)['mine'][0]['id'], $result['ad']['id']);
    $acceptance=one("SELECT details FROM audit_log WHERE user_id=? AND action='ads_terms_accepted'",[$u['id']]);
    eq(json_decode($acceptance['details'],true)['terms_version'],'2026-10-24');
});
test('Missing or stale Ads Terms acceptance cannot charge the wallet',function()use($banner){
    $u=customer();foreach([null,'old-version']as$version){$request=input();$request['terms_version']=$version;rejects(fn()=>Ads::create($u,$request,$banner,id()),'TERMS_REQUIRED');}eq(Wallet::balance($u['id'])['balance_usd'],'30.00');eq(Ads::listing($u)['mine'],[]);
});
test('Purchase retries return the same ad with one wallet debit', function () use ($banner) {
    $u = customer(); $key = id(); $a = purchase($u, $banner, $key); $b = purchase($u, $banner, $key); eq($a, $b);
    eq((int)one('SELECT COUNT(*) n FROM ads WHERE user_id=?', [$u['id']])['n'], 1);
    eq(Wallet::balance($u['id'])['balance_usd'], '20.00');
});
test('Changed payload with an existing key is rejected', function () use ($banner) {
    $u = customer(); $key = id(); purchase($u, $banner, $key); $input = input(); $input['title'] = 'Changed';
    rejects(fn() => Ads::create($u, $input, $banner, $key), 'IDEMPOTENCY_CONFLICT');
});
test('Insufficient balance creates no ad or debit', function () use ($banner) {
    $u = customer(999); rejects(fn() => purchase($u, $banner), 'INSUFFICIENT_FUNDS');
    eq(Wallet::balance($u['id'])['balance_usd'], '9.99'); eq(Ads::listing($u)['mine'], []);
});
test('Storage or database failure rolls back the charge and removes the uploaded file', function () use ($banner) {
    $u = customer(); $before = glob(__DIR__ . '/../storage/ad-*');
    db()->exec("CREATE TRIGGER fail_ad_insert BEFORE INSERT ON ads BEGIN SELECT RAISE(FAIL, 'Simulated insert failure'); END");
    try {
        try { Ads::create($u, input(), $banner, id()); throw new \RuntimeException('Expected failure'); }
        catch (\PDOException) {}
    } finally { db()->exec('DROP TRIGGER fail_ad_insert'); }
    eq(Wallet::balance($u['id'])['balance_usd'], '30.00');
    eq((int)one('SELECT COUNT(*) n FROM ledger WHERE user_id=?', [$u['id']])['n'], 0);
    eq(glob(__DIR__ . '/../storage/ad-*'), $before);
});
test('Configured price and maximum price are enforced server-side', function () use ($banner) {
    $u = customer(); putenv('ADS_PRICE_CENTS=1200'); rejects(fn() => purchase($u, $banner), 'PRICE_EXCEEDS_MAX');
    $result = Ads::create($u, ['title' => 'Configured', 'target_url' => 'https://example.com','terms_version'=>'2026-10-24'], $banner, id());
    global $stored; $row = one('SELECT * FROM ads WHERE id=?', [$result['ad']['id']]); $stored[] = __DIR__ . '/../storage/' . $row['banner_file'];
    eq($result['ad']['price_usd'], '12.00'); eq(Wallet::balance($u['id'])['balance_usd'], '18.00'); putenv('ADS_PRICE_CENTS=1000');
});
test('Other customers can view active ads but not owner history', function () use ($banner) {
    $u = customer(); $other = customer(); $result = purchase($u, $banner); $rows = Ads::listing($other);
    eq($rows['mine'], []); eq(Ads::image($other, $result['ad']['id'])['user_id'], $u['id']);
    eq(array_values(array_filter($rows['items'], fn($ad) => $ad['id'] === $result['ad']['id']))[0]['mine'], false);
});
test('Removal requires confirmation and ownership, and never refunds', function () use ($banner) {
    $u = customer(); $other = customer(); $result = purchase($u, $banner); $id = $result['ad']['id'];
    rejects(fn() => Ads::remove($u, $id, false), 'CONFIRMATION_REQUIRED'); rejects(fn() => Ads::remove($other, $id, true), 'NOT_FOUND');
    Ads::remove($u, $id, true); Ads::remove($u, $id, true); eq(Wallet::balance($u['id'])['balance_usd'], '20.00');
    rejects(fn() => Ads::image($other, $id), 'NOT_FOUND'); eq(Ads::listing($u)['mine'][0]['status'], 'removed');
});
test('Expiry excludes ads from board and blocks banner access for other users', function () use ($banner) {
    $u = customer(); $other = customer(); $result = purchase($u, $banner); $id = $result['ad']['id'];
    query('UPDATE ads SET expires_at=? WHERE id=?', [now(), $id]);
    eq(Ads::listing($u)['mine'][0]['status'], 'expired');
    eq(count(array_filter(Ads::listing($other)['items'], fn($row) => $row['id'] === $id)), 0);
    rejects(fn() => Ads::image($other, $id), 'NOT_FOUND');
});
test('Disabled advertisers do not appear in the board', function () use ($banner) {
    $u = customer(); $other = customer(); $result = purchase($u, $banner); query("UPDATE users SET status='disabled' WHERE id=?", [$u['id']]);
    eq(count(array_filter(Ads::listing($other)['items'], fn($row) => $row['id'] === $result['ad']['id'])), 0);
    rejects(fn() => Ads::image($other, $result['ad']['id']), 'NOT_FOUND');
});
echo "$passed Ads tests passed\n";
} finally { unlink($banner); foreach (array_unique($stored) as $file) if (is_file($file)) unlink($file); }

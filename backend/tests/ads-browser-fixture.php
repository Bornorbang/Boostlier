<?php
declare(strict_types=1);
namespace TempNumber;
if (PHP_SAPI !== 'cli') exit(1);
require __DIR__ . '/../src/bootstrap.php'; require __DIR__ . '/../src/Wallet.php';
if (env('APP_ENV') === 'production' || !preg_match('/^ads-browser-[0-9]+@example\.invalid$/D', $argv[2] ?? '')) exit(1);
$user = one('SELECT * FROM users WHERE email=?', [$argv[2]]);
if (!$user) exit(1);
if (($argv[1] ?? '') === 'fund') {
    tx(fn() => Wallet::change($user['id'], 'adjustment', 2000, 'ads-browser-qa:' . $user['id'], 'Local Ads browser test funds'));
    echo "QA wallet funded\n";
} elseif (($argv[1] ?? '') === 'expire') {
    query('UPDATE ads SET expires_at=? WHERE id=? AND user_id=?', [now(), $argv[3] ?? '', $user['id']]);
    echo "QA ad expired\n";
} else exit(1);

<?php
declare(strict_types=1);
namespace TempNumber;
if (PHP_SAPI !== 'cli') exit(1);
require __DIR__ . '/../src/bootstrap.php';
require __DIR__ . '/../src/Wallet.php';
if (env('APP_ENV') === 'production') exit(1);
$email = $argv[2] ?? '';
if (!preg_match('/^temp-mail-browser-[0-9]+@example\.invalid$/D', $email)) exit(1);
$user = one('SELECT * FROM users WHERE email=?', [$email]);
if (!$user) exit(1);
if (($argv[1] ?? '') === 'fund') {
    tx(fn() => Wallet::change($user['id'], 'adjustment', 500, 'temp-mail-qa:' . $user['id'], 'Local temporary-email browser test funds'));
    echo "QA wallet ready\n";
} elseif (($argv[1] ?? '') === 'expire') {
    query('UPDATE inboxes SET expires_at=? WHERE user_id=? AND id=?', [gmdate('Y-m-d H:i:s', time() - 10), $user['id'], $argv[3] ?? '']);
    echo "QA inbox expired\n";
} else exit(1);

<?php
declare(strict_types=1);
namespace TempNumber;
putenv('APP_ENV=testing'); putenv('TEMP_MAIL_PRICE_CENTS=70');
if (($argv[1] ?? '') === 'worker') {
    require __DIR__ . '/../src/bootstrap.php'; require __DIR__ . '/../src/Wallet.php'; require __DIR__ . '/../src/TempMail.php';
    for ($attempt = 0; $attempt < 35; $attempt++) {
        try {
            $provider = new TempMailProvider(function () { usleep(20000); return ['@example.com']; });
            if ($argv[2] === 'create') $result = TempMail::create(['id' => $argv[3]], [], $argv[4], $provider);
            else $result = TempMail::renew(['id' => $argv[3]], $argv[5], [], $argv[4]);
            echo json_encode($result); exit(0);
        } catch (\PDOException $e) {
            if (!str_contains($e->getMessage(), 'locked') && !str_contains($e->getMessage(), 'busy')) throw $e;
        } catch (Problem $e) {
            if ($e->key !== 'WALLET_BUSY') throw $e;
        }
        usleep(random_int(1000, 25000));
    }
    throw new \RuntimeException('Concurrency retry limit reached');
}
$file = __DIR__ . '/../storage/temp-mail-concurrency-' . bin2hex(random_bytes(8)) . '.sqlite';
putenv('DB_DSN=sqlite:' . $file);
require __DIR__ . '/../src/bootstrap.php'; require __DIR__ . '/../src/Wallet.php'; require __DIR__ . '/../src/TempMail.php';
foreach (glob(__DIR__ . '/../migrations/*.sql') as $migration) db()->exec(file_get_contents($migration));
query("DELETE FROM settings WHERE name='service_prices'");
$uid = id(); query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)', [$uid, 'Concurrent Mail QA', $uid . '@example.invalid', 'unused', id(), now()]);
query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,1000)', [$uid]);
function wave(string $uid, string $action, string $inbox = ''): void {
    $children = []; $key = id();
    for ($i = 0; $i < 8; $i++) {
        $pipes = []; $process = proc_open([PHP_BINARY, __FILE__, 'worker', $action, $uid, $key, $inbox], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $children[] = [$process, $pipes];
    }
    foreach ($children as [$process, $pipes]) {
        stream_get_contents($pipes[1]); $error = stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]);
        if (proc_close($process) !== 0) throw new \RuntimeException($error);
    }
}
wave($uid, 'create');
if ((int)one('SELECT COUNT(*) n FROM inboxes')['n'] !== 1 || Wallet::balance($uid)['balance_usd'] !== '9.30' || Wallet::balance($uid)['reserved_usd'] !== '0.00') throw new \RuntimeException('Concurrent create duplicated a charge or inbox');
echo "PASS 8 concurrent generation replays create one inbox and charge once\n";
$row = one('SELECT * FROM inboxes'); wave($uid, 'renew', $row['id']);
$renewed = one('SELECT * FROM inboxes');
if (strtotime($renewed['expires_at']) - strtotime($row['expires_at']) !== 86400 || Wallet::balance($uid)['balance_usd'] !== '8.60') throw new \RuntimeException('Concurrent renew duplicated an extension or charge');
echo "PASS 8 concurrent renewal replays extend once and charge once\n";

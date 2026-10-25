<?php
declare(strict_types=1);
namespace TempNumber;
if (PHP_SAPI !== 'cli') exit(1);
require __DIR__ . '/../src/bootstrap.php';
require __DIR__ . '/../src/Providers.php';
require __DIR__ . '/../src/Pricing.php';
$lock = fopen(__DIR__ . '/../storage/number-prices.lock', 'c');
if (!flock($lock, LOCK_EX | LOCK_NB)) exit(0);
$watch = in_array('--watch', $argv, true);
try {
    do {
        try {
            $provider = provider('textverified');
            $catalogue = $provider->catalogue('usa');
            $saved = [];
            foreach (all("SELECT id,expires_at FROM textverified_cache WHERE id LIKE 'catalogue-price:%'") as $row) $saved[$row['id']] = $row['expires_at'];
            $items = $catalogue['items'];
            usort($items, fn($a, $b) => strcmp($saved['catalogue-price:' . hash('sha256', $a['id'])] ?? '', $saved['catalogue-price:' . hash('sha256', $b['id'])] ?? ''));
            foreach ($items as $item) {
                $expires = $saved['catalogue-price:' . hash('sha256', $item['id'])] ?? '';
                if ($expires > now()) continue;
                $started = microtime(true);
                try {
                    $provider->warmCataloguePrice($item['id']);
                    echo json_encode(['service' => $item['id'], 'updated' => true, 'at' => now()]) . PHP_EOL;
                } catch (Problem $error) {
                    echo json_encode(['service' => $item['id'], 'error' => $error->key, 'at' => now()]) . PHP_EOL;
                    // Leave capacity for purchases and SMS polling; back off during provider trouble.
                    sleep(60);
                }
                usleep((int)(max(0, 1.1 - (microtime(true) - $started)) * 1000000));
            }
        } catch (\Throwable $error) {
            fwrite(STDERR, get_class($error) . ': catalogue refresh deferred.' . PHP_EOL);
            if (!$watch) exit(1);
        }
        if ($watch) sleep(60);
    } while ($watch);
} finally { flock($lock, LOCK_UN); fclose($lock); }

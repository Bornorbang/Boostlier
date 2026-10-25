<?php
declare(strict_types=1);
namespace TempNumber;
if (PHP_SAPI !== 'cli') exit(1);
require __DIR__ . '/../src/bootstrap.php';
$config = json_decode(file_get_contents(__DIR__ . '/../config/textverified-pricing.json'), true, 32, JSON_THROW_ON_ERROR);
$config['fx_updated_at'] = now();
tx(function () use ($config) {
    if (one('SELECT name FROM settings WHERE name=?' . lockSuffix(), ['textverified_pricing'])) query('UPDATE settings SET value=?,updated_at=? WHERE name=?', [json_encode($config), now(), 'textverified_pricing']);
    else query('INSERT INTO settings (name,value,updated_at) VALUES (?,?,?)', ['textverified_pricing', json_encode($config), now()]);
});
echo "TextVerified pricing configured: owner-approved fixed USD/USD rate and flat USD margin.\n";

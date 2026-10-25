<?php
declare(strict_types=1);
namespace TempNumber;
if (PHP_SAPI !== 'cli') exit(1);
require __DIR__ . '/../src/bootstrap.php'; require __DIR__ . '/../src/Providers.php'; require __DIR__ . '/../src/Pricing.php';
try {
    $provider = provider('textverified'); $catalogue = $provider->catalogue('usa');
    $result = ['connected'=>true,'sms_services'=>count($catalogue['items']),'pricing_configured'=>(bool)Pricing::setting('textverified_pricing')];
    if (!empty($argv[1])) {
        $quote = $provider->quote($argv[1], 'usa', []); $config = Pricing::setting('textverified_pricing');
        if (!$config) fail('PRICING_UNCONFIGURED', 'Configure number pricing first.', 503);
        $result += ['service'=>$argv[1],'available'=>$quote['stock'],'price_usd'=>money(Pricing::numberQuote($quote['cost_minor'],'textverified',$config))];
    }
    echo json_encode($result, JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Problem $error) { fwrite(STDERR, $error->key . ': ' . $error->getMessage() . PHP_EOL); exit(1); }

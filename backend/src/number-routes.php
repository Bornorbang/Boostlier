<?php
declare(strict_types=1);
namespace TempNumber;
if ($route === '/numbers/prices' && $method === 'POST') {
    rateLimit('number-prices:' . $u['id'], 12, 60);
    $services = body()['services'] ?? null;
    if (!is_array($services) || !array_is_list($services) || count($services) < 1 || count($services) > 10) fail('INVALID_SERVICES', 'Request prices for up to ten services at a time.');
    foreach ($services as $service) if (!is_string($service) || strlen($service) > 120) fail('INVALID_SERVICES', 'Choose valid services.');
    $config = Pricing::setting('textverified_pricing');
    if (!$config || ($config['currency'] ?? '') !== 'USD') fail('PRICING_UNCONFIGURED', 'Number pricing is not configured.', 503);
    $provider = provider('textverified'); $items = []; $started = microtime(true);
    foreach (array_unique($services) as $service) {
        if (microtime(true) - $started > 7) { $items[] = ['service' => $service, 'price_usd' => null, 'error' => 'Price lookup took too long. Please retry.']; continue; }
        try {
            $price = $provider->displayPrice($service);
            $items[] = ['service' => $service, 'price_usd' => money(Pricing::numberQuote($price['cost_minor'], 'textverified', $config))];
        } catch (Problem $error) { $items[] = ['service' => $service, 'price_usd' => null, 'error' => $error->getMessage()]; }
    }
    json(['items' => $items]);
}
if ($route === '/numbers/services' && $method === 'GET') {
    rateLimit('number-catalogue:' . $u['id'], 15, 60);
    $config = Pricing::setting('textverified_pricing');
    if (!$config || ($config['currency'] ?? '') !== 'USD') fail('PRICING_UNCONFIGURED', 'Number pricing is not configured.', 503);
    json(provider('textverified')->pricedCatalogue($config));
}
if ($route === '/numbers/quote' && $method === 'POST') {
    rateLimit('number-quote:' . $u['id'], 20, 60);
    $input = body(); $service = required($input, 'service', 120);
    $quote = provider('textverified')->quote($service, 'usa', []);
    $config = Pricing::setting('textverified_pricing');
    if (!$config || ($config['currency'] ?? '') !== $quote['currency']) fail('PRICING_UNCONFIGURED', 'USA number pricing is awaiting the approved exchange rate and markup.', 503);
    json(['service' => $service, 'price_usd' => money(Pricing::numberQuote($quote['cost_minor'], 'textverified', $config)), 'stock' => $quote['stock'], 'currency' => 'USD']);
}

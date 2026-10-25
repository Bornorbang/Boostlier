<?php
declare(strict_types=1);
namespace TempNumber;

/** Current TextVerified v2 schema: only US mobile SMS verifications are offered. */
final class TextVerifiedProvider implements NumberProvider
{
    private const BASE = 'https://www.textverified.com';
    private ?\Closure $transport;
    public function __construct(?callable $transport = null) { $this->transport = $transport ? \Closure::fromCallable($transport) : null; }

    public static function safeUrl(string $url): string
    {
        if (str_starts_with($url, '/api/pub/v2/')) $url = self::BASE . $url;
        $parts = parse_url($url);
        if (($parts['scheme'] ?? '') !== 'https' || !in_array(strtolower($parts['host'] ?? ''), ['www.textverified.com', 'textverified.com', 'backend.textverified.com'], true)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['port']) || isset($parts['fragment']) || !str_starts_with($parts['path'] ?? '', '/api/pub/v2/')
            || str_contains($parts['path'], '..') || preg_match('/%2e|%2f|%5c|[\x00-\x20\\\\]/i', $parts['path']))
            fail('INVALID_PROVIDER_LINK', 'The number provider returned an invalid follow-up link.', 503);
        return $url;
    }

    private function raw(string $method, string $url, ?array $body, array $headers): array
    {
        $url = self::safeUrl($url);
        if ($this->transport) return ($this->transport)($method, $url, $body, $headers);
        rateLimit('textverified-provider', 90, 60);
        $curl = curl_init($url); $responseHeaders = [];
        curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 16, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER => array_merge(['Accept: application/json', 'Content-Type: application/json', 'User-Agent: Boostlier/1.0'], $headers),
            CURLOPT_HEADERFUNCTION => static function ($curl, $line) use (&$responseHeaders) { if (str_contains($line, ':')) { [$key, $value] = explode(':', $line, 2); $responseHeaders[strtolower(trim($key))] = trim($value); } return strlen($line); },
        ]);
        if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body, JSON_THROW_ON_ERROR));
        elseif ($method === 'POST') curl_setopt($curl, CURLOPT_POSTFIELDS, '');
        if (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA')) curl_setopt($curl, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
        $raw = curl_exec($curl); $http = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE); curl_close($curl);
        if (!is_string($raw) || $http === 0) throw new AmbiguousProvisioning('Number provider transport outcome unknown.');
        return ['http' => $http, 'data' => $raw === '' ? [] : json_decode($raw, true), 'headers' => $responseHeaders];
    }

    private function token(bool $fresh = false): string
    {
        if (!$this->transport && (!env('TEXTVERIFIED_API_KEY') || !env('TEXTVERIFIED_API_USERNAME'))) fail('PROVIDER_UNAVAILABLE', 'USA numbers are awaiting provider connection details.', 503);
        $id = 'token:' . substr(hash('sha256', env('TEXTVERIFIED_API_KEY') . env('TEXTVERIFIED_API_USERNAME')), 0, 32);
        $cached = $this->transport ? null : one('SELECT * FROM textverified_cache WHERE id=? AND expires_at>?', [$id, gmdate('Y-m-d H:i:s', time() + 45)]);
        if (!$fresh && $cached) return json_decode($cached['payload'], true)['token'];
        $result = $this->raw('POST', '/api/pub/v2/auth', null, ['X-API-KEY: ' . env('TEXTVERIFIED_API_KEY'), 'X-API-USERNAME: ' . env('TEXTVERIFIED_API_USERNAME')]);
        $data = $result['data'];
        if ($result['http'] !== 200 || !is_array($data) || !is_string($data['token'] ?? null) || !strtotime($data['expiresAt'] ?? '')) fail('PROVIDER_UNAVAILABLE', 'The USA number provider connection could not be authenticated.', 503);
        if (!$this->transport) $this->cache($id, ['token' => $data['token']], gmdate('Y-m-d H:i:s', strtotime($data['expiresAt'])));
        return $data['token'];
    }

    private function cache(string $id, array $payload, string $expires): void
    {
        tx(function () use ($id, $payload, $expires) {
            if (one('SELECT id FROM textverified_cache WHERE id=?' . lockSuffix(), [$id])) query('UPDATE textverified_cache SET payload=?,expires_at=? WHERE id=?', [json_encode($payload), $expires, $id]);
            else query('INSERT INTO textverified_cache (id,payload,expires_at) VALUES (?,?,?)', [$id, json_encode($payload), $expires]);
        });
        if (str_starts_with($id, 'price:')) {
            $payload['checked_at'] = now();
            $this->cache('catalogue-price:' . substr($id, 6), $payload, gmdate('Y-m-d H:i:s', time() + 21600));
        }
    }

    private function request(string $method, string $url, ?array $body = null, ?string $intent = null): array
    {
        try {
            $headers = ['Authorization: Bearer ' . $this->token()];
            if ($intent) $headers[] = 'Idempotency-Key: boostlier-' . $intent;
            $result = $this->raw($method, $url, $body, $headers);
            if ($result['http'] === 401) {
                $headers[0] = 'Authorization: Bearer ' . $this->token(true);
                $result = $this->raw($method, $url, $body, $headers);
            }
        } catch (AmbiguousProvisioning $error) {
            if ($intent) throw $error;
            fail('PROVIDER_UNAVAILABLE', 'The number provider could not be reached. Your order remains unchanged.', 503);
        }
        $http = $result['http']; $data = $result['data'];
        if ($intent && $http === 400 && is_array($data) && !empty($data['errorCode'])) throw new NumberProviderRejected('PROVIDER_REJECTED', 'The provider could not supply this number. Reserved funds have been released.');
        if ($http === 429) { if ($intent) throw new AmbiguousProvisioning('Rate-limited dispatch outcome requires retry with same key.'); fail('PROVIDER_RATE_LIMITED', 'Please wait before checking this number again.', 429); }
        if ($http < 200 || $http >= 300 || !is_array($data)) {
            if ($intent) throw new AmbiguousProvisioning('Number purchase requires reconciliation.');
            fail('PROVIDER_UNAVAILABLE', 'The number provider could not complete this request. Please retry.', 503);
        }
        return $result;
    }
    /** Shared authenticated transport for the fixed-term rental adapter. */
    public function rentalRequest(string $method,string $url,?array $body=null,?string $intent=null):array
    {
        return $this->request($method,$url,$body,$intent);
    }

    public function catalogue(string $country): array
    {
        if (!in_array($country, ['usa', 'united-states'], true)) fail('INVALID_COUNTRY', 'This provider supplies US numbers only.');
        $cached = $this->transport ? null : one('SELECT * FROM textverified_cache WHERE id=? AND expires_at>?', ['services', now()]);
        if ($cached) return json_decode($cached['payload'], true);
        $rows = $this->request('GET', '/api/pub/v2/services?numberType=mobile&reservationType=verification')['data'];
        if (!array_is_list($rows)) fail('INVALID_PROVIDER_RESPONSE', 'The service list could not be read.', 503);
        $items = [];
        foreach ($rows as $row) {
            $name = $row['serviceName'] ?? '';
            if (!is_string($name) || $name === '' || strlen($name) > 120 || str_starts_with($name, 'test_') || in_array($name, ['allservices', 'servicenotlisted', 'servicenotlistedvoice'], true) || !in_array(strtolower((string)($row['capability'] ?? '')), ['sms', 'smsandvoicecombo'], true)) continue;
            $items[] = ['id' => $name, 'service' => strip_tags((string)(($row['description'] ?? '') ?: $name)), 'capability' => 'sms'];
        }
        usort($items, fn($a, $b) => strcasecmp($a['service'], $b['service']));
        $result = ['items' => $items, 'currency' => 'USD', 'country' => 'usa'];
        if (!$this->transport) $this->cache('services', $result, gmdate('Y-m-d H:i:s', time() + 120));
        return $result;
    }

    public static function cents(mixed $value): int
    {
        if (!is_int($value) && !is_float($value) && !is_string($value)) fail('INVALID_PROVIDER_PRICE', 'The provider returned an invalid price.', 503);
        $value = (string)$value;
        if (!preg_match('/^\d{1,7}(?:\.\d{1,6})?$/D', $value)) fail('INVALID_PROVIDER_PRICE', 'The provider returned an invalid price.', 503);
        return (int)bcdiv(bcadd(bcmul($value, '100', 6), '0.999999', 6), '1', 0);
    }

    public function quote(string $service, string $country, array $options): array
    {
        if ($options !== []) fail('UNSUPPORTED_OPTIONS', 'Area code, carrier and reuse options are not enabled for this service.');
        $catalogue = $this->catalogue($country);
        if (!in_array($service, array_column($catalogue['items'], 'id'), true)) fail('SERVICE_UNAVAILABLE', 'Choose an available SMS service.');
        $body = ['serviceName' => $service, 'numberType' => 'mobile', 'capability' => 'sms'];
        $inventory = $this->request('POST', '/api/pub/v2/inventory/verifications', $body)['data'];
        $stock = $inventory['availableQuantity'] ?? null;
        if (!is_int($stock) || $stock < 0) fail('INVALID_PROVIDER_RESPONSE', 'Availability could not be confirmed.', 503);
        if ($stock === 0) fail('OUT_OF_STOCK', 'No numbers are currently available for this service.');
        $pricing = $this->request('POST', '/api/pub/v2/pricing/verifications', $body + ['areaCode' => false, 'carrier' => false])['data'];
        if (($pricing['serviceName'] ?? '') !== $service) fail('INVALID_PROVIDER_RESPONSE', 'The service quote could not be confirmed.', 503);
        $cost = self::cents($pricing['price'] ?? null);
        if ($cost < 1) fail('INVALID_PROVIDER_PRICE', 'The provider returned an invalid price.', 503);
        if (!$this->transport) $this->cache('price:' . hash('sha256', $service), ['currency' => 'USD', 'cost_minor' => $cost, 'service' => $service], gmdate('Y-m-d H:i:s', time() + 300));
        return ['currency' => 'USD', 'cost_minor' => $cost, 'stock' => $stock, 'service' => $service];
    }

    public function displayPrice(string $service): array
    {
        if (!in_array($service, array_column($this->catalogue('usa')['items'], 'id'), true)) fail('SERVICE_UNAVAILABLE', 'Choose an available SMS service.');
        $id = 'price:' . hash('sha256', $service);
        $cached = $this->transport ? null : one('SELECT * FROM textverified_cache WHERE id=? AND expires_at>?', [$id, now()]);
        if ($cached) return json_decode($cached['payload'], true);
        $pricing = $this->request('POST', '/api/pub/v2/pricing/verifications', ['serviceName' => $service, 'numberType' => 'mobile', 'capability' => 'sms', 'areaCode' => false, 'carrier' => false])['data'];
        if (($pricing['serviceName'] ?? '') !== $service) fail('INVALID_PROVIDER_RESPONSE', 'The service price could not be confirmed.', 503);
        $cost = self::cents($pricing['price'] ?? null);
        if ($cost < 1) fail('INVALID_PROVIDER_PRICE', 'The provider returned an invalid price.', 503);
        $result = ['currency' => 'USD', 'cost_minor' => $cost, 'service' => $service];
        if (!$this->transport) $this->cache($id, $result, gmdate('Y-m-d H:i:s', time() + 300));
        return $result;
    }

    /** One local snapshot: no per-service provider calls from page views or searches. */
    public function pricedCatalogue(array $config): array
    {
        $saved = one('SELECT payload FROM textverified_cache WHERE id=?', ['services']);
        $catalogue = $saved ? json_decode($saved['payload'], true) : $this->catalogue('usa');
        $prices = [];
        foreach (all("SELECT id,payload FROM textverified_cache WHERE id LIKE 'catalogue-price:%' OR id LIKE 'price:%'") as $row) {
            $price = json_decode($row['payload'], true);
            if (!is_array($price) || !is_string($price['service'] ?? null)) continue;
            $service = $price['service'];
            if (str_starts_with($row['id'], 'catalogue-price:') || !isset($prices[$service])) $prices[$service] = $price;
        }
        $pending = 0; $items = [];
        foreach ($catalogue['items'] as $item) {
            $price = $prices[$item['id']] ?? null;
            $cost = $price['cost_minor'] ?? null;
            $item['price_usd'] = is_int($cost) && $cost > 0 ? money(Pricing::numberQuote($cost, 'textverified', $config)) : null;
            $item['price_pending'] = $price === null;
            if ($price === null) $pending++;
            elseif ($item['price_usd'] === null) $item['error'] = 'This service is currently unavailable.';
            $items[] = $item;
        }
        return ['items' => $items, 'country' => 'usa', 'pricing_configured' => true, 'prices_syncing' => $pending > 0];
    }

    /** Called by the background worker, never by browsing the catalogue. */
    public function warmCataloguePrice(string $service): void
    {
        try {
            $price = $this->displayPrice($service);
        } catch (Problem $error) {
            // Transient outages/rate limits must not overwrite a previously usable price.
            if (!in_array($error->key, ['SERVICE_UNAVAILABLE', 'OUT_OF_STOCK', 'INVALID_PROVIDER_PRICE'], true)) throw $error;
            $price = ['service' => $service, 'cost_minor' => null];
        }
        $price['checked_at'] = now();
        $this->cache('catalogue-price:' . hash('sha256', $service), $price, gmdate('Y-m-d H:i:s', time() + 21600));
    }

    public function purchase(string $intent, array $quote): array
    {
        if (!preg_match('/^[a-f0-9]{32}$/D', $intent)) fail('INVALID_INTENT', 'Invalid order intent.');
        $request = one('SELECT * FROM number_provider_requests WHERE intent_id=?', [$intent]);
        if (!$request) {
            $body = ['serviceName' => $quote['service'], 'capability' => 'sms', 'maxPrice' => (float)money((int)$quote['cost_minor'])];
            query('INSERT INTO number_provider_requests (intent_id,request_payload,status,updated_at) VALUES (?,?,?,?)', [$intent, json_encode($body), 'pending', now()]);
            $request = one('SELECT * FROM number_provider_requests WHERE intent_id=?', [$intent]);
        }
        if ($request['status'] === 'rejected') throw new NumberProviderRejected('PROVIDER_REJECTED', 'The provider rejected this number request.');
        $body = json_decode($request['request_payload'], true);
        $href = $request['details_href'];
        if (!$href) {
            try { $created = $this->request('POST', '/api/pub/v2/verifications', $body, $intent); }
            catch (NumberProviderRejected $error) { query("UPDATE number_provider_requests SET status='rejected',updated_at=? WHERE intent_id=?", [now(), $intent]); throw $error; }
            $href = $created['headers']['location'] ?? $created['data']['href'] ?? '';
            $href = self::safeUrl($href);
            query("UPDATE number_provider_requests SET details_href=?,status='acknowledged',updated_at=? WHERE intent_id=?", [$href, now(), $intent]);
        }
        $details = $this->request('GET', $href)['data'];
        $id = $details['id'] ?? ''; $phone = $details['number'] ?? ''; $ends = strtotime($details['endsAt'] ?? '');
        if (self::cents($details['totalCost'] ?? null) > self::cents($body['maxPrice'])) throw new AmbiguousProvisioning('Provider total exceeds agreed maximum.');
        if (!is_string($id) || !preg_match('/^[a-zA-Z0-9_-]{1,120}$/D', $id) || !is_string($phone) || !preg_match('/^\+?\d{10,15}$/D', $phone) || !$ends || ($details['serviceName'] ?? '') !== $body['serviceName']) throw new AmbiguousProvisioning('Incomplete verification receipt.');
        return ['id' => $id, 'phone' => $phone, 'expires_at' => gmdate('Y-m-d H:i:s', $ends), 'cost_minor' => self::cents($details['totalCost'])];
    }

    public function findIntent(string $intent): array
    {
        $saved = one('SELECT * FROM number_provider_requests WHERE intent_id=?', [$intent]);
        if (!$saved) fail('RECONCILIATION_REQUIRED', 'This order requires review before retrying. Funds remain reserved.', 409);
        if ($saved['status'] === 'rejected') return ['authoritative' => true, 'outcome' => 'not_provisioned'];
        try { $receipt = $this->purchase($intent, []); }
        catch (NumberProviderRejected) { return ['authoritative' => true, 'outcome' => 'not_provisioned']; }
        return ['authoritative' => true, 'outcome' => 'provisioned', 'receipt' => $receipt];
    }

    public function status(string $providerId): array
    {
        if (!preg_match('/^[a-zA-Z0-9_-]{1,120}$/D', $providerId)) fail('INVALID_ORDER', 'Invalid number order.');
        $detail = $this->request('GET', '/api/pub/v2/verifications/' . rawurlencode($providerId))['data'];
        if (($detail['id'] ?? '') !== $providerId) fail('INVALID_PROVIDER_RESPONSE', 'The provider returned a different verification.', 503);
        $sms = $this->request('GET', '/api/pub/v2/sms?' . http_build_query(['reservationId' => $providerId, 'reservationType' => 'verification']))['data'];
        if (!isset($sms['data']) || !is_array($sms['data']) || ($sms['hasNext'] ?? false)) fail('RECONCILIATION_REQUIRED', 'The message history requires review. No refund has been assumed.', 409);
        $code = ''; $messages = [];
        foreach ($sms['data'] as $message) {
            if (($message['to'] ?? '') !== ($detail['number'] ?? '')) fail('INVALID_PROVIDER_RESPONSE', 'The provider returned a message for a different number.', 503);
            if (!empty($message['encrypted'])) continue;
            $parsed = $message['parsedCode'] ?? null;
            if (is_string($parsed) && $parsed !== '') $code = $parsed;
            if (is_string($message['smsContent'] ?? null)) $messages[] = ['id' => (string)$message['id'], 'body' => $message['smsContent']];
        }
        $state = $detail['state'] ?? 'unknown';
        $result = ['status' => $code !== '' ? 'completed' : 'active', 'sms_code' => $code, 'messages' => $messages,
            'authoritative' => true, 'provider_state' => $state, 'can_cancel' => ($detail['cancel']['canCancel'] ?? false) === true && $code === ''];
        // Supplier wallet settlement is separate from Boostlier's customer refund policy.
        if ($code === '' && strtolower($state) === 'verificationrefunded' && $sms['data'] === []) $result += ['no_sms_confirmed' => true];
        if (isset($result['no_sms_confirmed'])) $result['status'] = 'cancelled';
        elseif ($code === '' && in_array(strtolower($state), ['verificationcanceled','verificationtimedout'], true)) {
            $result['status'] = strtolower($state) === 'verificationtimedout' ? 'expired' : 'cancelled';
            $result['customer_refund_reason'] = strtolower($state) === 'verificationtimedout' ? 'timeout' : 'cancelled';
        } elseif ($code === '' && in_array(strtolower($state), ['verificationreported','verificationrefunded'], true)) $result['status'] = 'reconciliation';
        return $result;
    }

    public function cancel(string $providerId): array
    {
        $before = $this->status($providerId);
        if ($before['sms_code'] !== '' || !$before['can_cancel']) return $before;
        $this->request('POST', '/api/pub/v2/verifications/' . rawurlencode($providerId) . '/cancel');
        // An accepted cancellation qualifies for Boostlier's full customer refund.
        try { $after = $this->status($providerId); }
        catch (Problem) { $after = $before; }
        $after['cancel_requested'] = $after['sms_code'] === '' && $after['status'] !== 'completed';
        return $after;
    }

    public function finish(string $providerId): array { fail('UNSUPPORTED_ACTION', 'Finishing is not supported for this number provider.'); }
}

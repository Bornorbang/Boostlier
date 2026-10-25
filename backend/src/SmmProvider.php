<?php
declare(strict_types=1);
namespace TempNumber;

final class ProviderRejected extends Problem {}

final class SmmProvider implements ProductProvider
{
    private const URL = 'https://app.smmpanel.ng/api/v2';
    private ?\Closure $transport;

    public function __construct(?callable $transport = null)
    {
        $this->transport = $transport === null ? null : \Closure::fromCallable($transport);
    }

    public function request(string $action, array $parameters = [], bool $mutation = false): array
    {
        if ($this->transport) {
            $response = ($this->transport)($action, $parameters);
        } else {
            if (!env('SMM_API_KEY')) fail('PROVIDER_UNAVAILABLE', 'Boost Account is not connected.', 503);
            // Shared rolling window across web requests and background jobs, below the vendor's 120/minute ceiling.
            tx(function () {
                one('SELECT id FROM smm_rate_lock WHERE id=1' . lockSuffix());
                query('UPDATE smm_rate_lock SET touched_at=? WHERE id=1', [now()]);
                query('DELETE FROM smm_requests WHERE created_at<?', [gmdate('Y-m-d H:i:s', time() - 60)]);
                if ((int)one('SELECT COUNT(*) n FROM smm_requests')['n'] >= 100) {
                    header('Retry-After: 60');
                    fail('PROVIDER_RATE_LIMITED', 'Please wait a minute before checking this service again.', 429);
                }
                query('INSERT INTO smm_requests (id,created_at) VALUES (?,?)', [id(), now()]);
            });
            $curl = curl_init(self::URL);
            curl_setopt_array($curl, [
                CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POSTFIELDS => http_build_query(['key' => env('SMM_API_KEY'), 'action' => $action] + $parameters),
                CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'],
                CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 18, CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            ]);
            if (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA')) curl_setopt($curl, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
            $raw = curl_exec($curl);
            $http = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            curl_close($curl);
            $response = is_string($raw) ? json_decode($raw, true) : null;
            if ($raw === false || !is_array($response) || $http >= 500 || $http === 0) {
                if ($mutation) throw new AmbiguousProvisioning('The provider outcome is unknown.');
                fail('PROVIDER_UNAVAILABLE', 'Boost Account could not reach the provider. Your orders remain unchanged.', 503);
            }
            if ($http === 429) {
                header('Retry-After: 60');
                fail('PROVIDER_RATE_LIMITED', 'The provider request limit has been reached. Please retry later.', 429);
            }
            if ($http >= 400 && !isset($response['error'])) {
                if ($mutation) throw new AmbiguousProvisioning('Unrecognised provider response.');
                fail('PROVIDER_UNAVAILABLE', 'The provider returned an unexpected response.', 503);
            }
        }
        if (!is_array($response)) throw new AmbiguousProvisioning('Invalid response.');
        if (isset($response['error'])) {
            if ($mutation && (isset($response['order']) || isset($response['refill']))) throw new AmbiguousProvisioning('Contradictory provider receipt and error.');
            // Do not expose raw vendor errors, account details or any echoed request/key.
            throw new ProviderRejected('PROVIDER_REJECTED', 'The provider could not accept this request. Check the service details or try later.', 422);
        }
        return $response;
    }

    public static function costMinor(string $rate, int $quantity): int
    {
        if (!preg_match('/^\d{1,9}(?:\.\d{1,6})?$/D', $rate) || $quantity < 1 || $quantity > 1000000000) {
            fail('INVALID_PROVIDER_PRICE', 'This service has an unsupported rate or quantity.', 503);
        }
        // Rate is NGN per 1,000. Calculate total kobo, rounding upward exactly once.
        [$whole, $fraction] = array_pad(explode('.', $rate, 2), 2, '');
        $scaled = ltrim($whole . str_pad($fraction, 6, '0'), '0') ?: '0';
        $numerator = bcmul(bcmul($scaled, (string)$quantity, 0), '100', 0);
        $value = bcdiv(bcadd($numerator, '999999999', 0), '1000000000', 0);
        if (bccomp($value, (string)PHP_INT_MAX) > 0) fail('INVALID_PROVIDER_PRICE', 'This quote exceeds the supported amount.', 503);
        return (int)$value;
    }

    public static function validateTarget(string $target): string
    {
        $target=trim($target);
        $parts=parse_url($target);
        $host=strtolower($parts['host']??'');
        if (!filter_var($target,FILTER_VALIDATE_URL) || !in_array($parts['scheme']??'', ['http','https'],true) || isset($parts['user']) || isset($parts['pass']) || $host==='' || $host==='localhost' || str_ends_with($host,'.local') || str_ends_with($host,'.localhost') || !str_contains($host,'.')) fail('INVALID_TARGET','Enter a public HTTP or HTTPS target link.');
        if (filter_var($host,FILTER_VALIDATE_IP) && !filter_var($host,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE)) fail('INVALID_TARGET','Use a public target, not a private network address.');
        return $target;
    }

    private function services(bool $fresh = false): array
    {
        $cached = $this->transport ? null : one('SELECT * FROM smm_catalogue_cache WHERE id=?', ['services']);
        if (!$fresh && $cached && strtotime($cached['updated_at']) >= time() - 60) return ['items' => json_decode($cached['payload'], true), 'stale' => false];
        try {
            $rows = $this->request('services');
            if (!array_is_list($rows)) fail('INVALID_PROVIDER_RESPONSE', 'The service catalogue could not be read.', 503);
            $items = [];
            foreach ($rows as $row) {
                if (!is_array($row) || !isset($row['service'], $row['name'], $row['rate'], $row['min'], $row['max'])) continue;
                $minimum = filter_var($row['min'], FILTER_VALIDATE_INT);
                $maximum = filter_var($row['max'], FILTER_VALIDATE_INT);
                if ($minimum === false || $maximum === false || $minimum < 1 || $maximum < $minimum || $maximum > 1000000000) continue;
                self::costMinor((string)$row['rate'], 1);
                $items[] = [
                    'id' => (string)$row['service'], 'name' => mb_substr(strip_tags((string)$row['name']),0,255),
                    'category' => strip_tags((string)($row['category'] ?? 'Other')),
                    'description' => strip_tags((string)($row['description'] ?? $row['name'])),
                    'type' => (string)($row['type'] ?? ''), 'minimum' => $minimum, 'maximum' => $maximum,
                    'rate' => (string)$row['rate'], 'refill' => filter_var($row['refill'] ?? false, FILTER_VALIDATE_BOOLEAN),
                ];
            }
            if (!$this->transport) tx(function () use ($items) {
                $row = one('SELECT id FROM smm_catalogue_cache WHERE id=?' . lockSuffix(), ['services']);
                if ($row) query('UPDATE smm_catalogue_cache SET payload=?,updated_at=? WHERE id=?', [json_encode($items), now(), 'services']);
                else query('INSERT INTO smm_catalogue_cache (id,payload,updated_at) VALUES (?,?,?)', ['services', json_encode($items), now()]);
            });
            return ['items' => $items, 'stale' => false];
        } catch (Problem $error) {
            if (!$fresh && $cached) return ['items' => json_decode($cached['payload'], true), 'stale' => true];
            throw $error;
        }
    }

    private static function serviceAllowed(array $row): bool
    {
        foreach (['name', 'category', 'description'] as $field) {
            if (preg_match('/\b(?:Nigeria|Nigerian|Nigerians|Owlet)\b/iu', (string)($row[$field] ?? ''))) return false;
        }
        return true;
    }

    public function catalogue(string $product): array
    {
        $snapshot = $this->services();
        $items = array_map(function (array $row) {
            $supported = strcasecmp($row['type'], 'Default') === 0;
            return [
                'id' => $row['id'], 'name' => $row['name'], 'category' => $row['category'],
                'description' => $row['description'], 'minimum' => $row['minimum'], 'maximum' => $row['maximum'],
                'type' => $row['type'], 'supported' => $supported, 'refill' => $row['refill'], 'cancel' => false,
                'unavailable_reason' => $supported ? null : 'This service requires additional order fields and cannot be ordered here yet.',
            ];
        }, array_values(array_filter($snapshot['items'], [self::class, 'serviceAllowed'])));
        $config = Pricing::setting('smm_pricing');
        $pricing = $config && ($config['currency'] ?? '') === 'NGN';
        return ['items' => $items, 'state' => $snapshot['stale'] ? 'stale' : 'live', 'pricing_configured' => (bool)$pricing,
            'message' => !$pricing ? 'Services are connected. USD pricing is awaiting the approved exchange rate and markup.' : ($snapshot['stale'] ? 'Showing the last successful catalogue. Purchases require a fresh quote.' : null)];
    }

    public function quote(string $product, array $request, ?array $resource): array
    {
        if ($resource) fail('UNSUPPORTED_ACTION', 'Social promotion orders cannot be renewed.');
        $service = required($request, 'service', 120);
        $quantity = filter_var($request['quantity'] ?? null, FILTER_VALIDATE_INT);
        if ($quantity === false || $quantity < 1) fail('INVALID_QUANTITY', 'Enter a positive whole quantity.');
        $snapshot=$this->services(empty($request['_preview']));
        if($snapshot['stale'])fail('PROVIDER_UNAVAILABLE','A current quote is unavailable. Please retry later.',503);
        $rows = $snapshot['items'];
        foreach ($rows as $row) if ($row['id'] === $service) {
            if (!self::serviceAllowed($row)) fail('SERVICE_UNAVAILABLE', 'This service is no longer available.', 422);
            if (strcasecmp($row['type'], 'Default') !== 0) fail('UNSUPPORTED_SERVICE_TYPE', 'This service requires unsupported additional order fields.');
            if ($quantity < $row['minimum'] || $quantity > $row['maximum']) fail('INVALID_QUANTITY', 'Choose a quantity between ' . $row['minimum'] . ' and ' . $row['maximum'] . '.');
            return ['currency' => 'NGN', 'cost_minor' => self::costMinor($row['rate'], $quantity), 'minimum' => $row['minimum'], 'maximum' => $row['maximum'],
                'service' => $service, 'quantity' => $quantity, 'name' => $row['name'], 'refill' => $row['refill'], 'target' => $request['target'] ?? null];
        }
        fail('SERVICE_UNAVAILABLE', 'This service is no longer available.', 422);
    }

    public function fulfil(string $intent, string $operation, array $quote, ?array $resource): array
    {
        if ($operation !== 'purchase') fail('UNSUPPORTED_ACTION', 'Renewal is unavailable.');
        if (empty($quote['target'])) fail('INVALID_TARGET', 'A public target link is required.');
        $response = $this->request('add', ['service' => $quote['service'], 'link' => $quote['target'], 'quantity' => $quote['quantity']], true);
        if (!isset($response['order']) || !preg_match('/^\d+$/D', (string)$response['order'])) throw new AmbiguousProvisioning('No confirmed provider order identifier.');
        return ['id' => (string)$response['order'], 'service_name' => $quote['name'], 'refill' => $quote['refill']];
    }

    public static function normaliseStatus(array $response): array
    {
        if (($response['currency'] ?? '') !== 'NGN') fail('INVALID_PROVIDER_CURRENCY', 'Order status requires currency reconciliation.', 409);
        $raw = (string)($response['status'] ?? '');
        $status = match (strtolower(trim($raw))) {
            'pending' => 'pending', 'processing', 'in progress', 'inprogress' => 'active',
            'completed' => 'completed', 'partial' => 'partial', 'canceled', 'cancelled' => 'cancelled',
            default => 'reconciliation',
        };
        $result = ['status' => $status, 'provider_status' => $raw, 'authoritative' => true];
        if(isset($response['charge'])&&preg_match('/^\d{1,9}(?:\.\d{1,6})?$/D',(string)$response['charge']))$result['cost_minor']=self::costMinor((string)$response['charge'],1000);
        foreach (['start_count' => 'start_count', 'remains' => 'remaining'] as $from => $to) {
            $value = $response[$from] ?? null;
            if ($value !== null && preg_match('/^\d{1,10}$/D', (string)$value)) $result[$to] = (int)$value;
        }
        // The supplied API does not confirm USD customer refund amounts. No inferred partial/cancellation credit.
        return $result;
    }

    public function action(string $providerId, string $action): array
    {
        if ($action === 'cancel') fail('CANCELLATION_UNAVAILABLE', 'This provider does not support cancellation.');
        if ($action !== 'status') fail('UNSUPPORTED_ACTION', 'Use the dedicated refill workflow.');
        return self::normaliseStatus($this->request('status', ['order' => $providerId]));
    }

    public function findIntent(string $intent): array { fail('MANUAL_RECONCILIATION_REQUIRED', 'The provider has no documented request lookup. Check the provider account before attaching a verified order. Funds remain reserved.', 409); }
    public function messages(string $providerId): array { fail('UNSUPPORTED_ACTION', 'SMM orders do not have inboxes.'); }
    public function message(string $providerId, string $messageId): array { fail('UNSUPPORTED_ACTION', 'SMM orders do not have inboxes.'); }
    public function delete(string $providerId): bool { fail('CANCELLATION_UNAVAILABLE', 'Cancellation is unavailable.'); }
}

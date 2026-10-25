<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__ . '/Pricing.php';

final class Ads
{
    public static function price(): int
    {
        $saved = Pricing::setting('service_prices');
        $value = isset($saved['ads_cents']) ? (string)$saved['ads_cents'] : env('ADS_PRICE_CENTS', '1000');
        if (!ctype_digit($value) || (int)$value < 1 || (int)$value > 100000000) fail('PRICING_UNCONFIGURED', 'Ad pricing is unavailable.', 503);
        return (int)$value;
    }

    public static function expiry(?\DateTimeImmutable $start = null): string
    {
        $start = ($start ?? new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('Europe/London'));
        $month = $start->modify('first day of next month');
        $expiry = $month->setDate((int)$month->format('Y'), (int)$month->format('m'), min((int)$start->format('d'), (int)$month->format('t')));
        return $expiry->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    public static function target(string $value): string
    {
        $parts = parse_url($value);
        $host = strtolower($parts['host'] ?? '');
        if (!filter_var($value, FILTER_VALIDATE_URL) || !in_array($parts['scheme'] ?? '', ['https', 'http'], true)
            || isset($parts['user']) || isset($parts['pass']) || !str_contains($host, '.') || str_ends_with($host, '.local') || str_ends_with($host, '.localhost')
            || (filter_var($host, FILTER_VALIDATE_IP) && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)))
            fail('INVALID_TARGET', 'Enter a public HTTP or HTTPS website link.');
        return $value;
    }

    public static function banner(string $file): array
    {
        if (!is_file($file) || filesize($file) > 2 * 1024 * 1024) fail('INVALID_BANNER', 'Upload a PNG, JPEG or WebP banner of at most 2 MB.');
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file);
        $types = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
        $image = @getimagesize($file);
        if (!isset($types[$mime]) || !$image || $image['mime'] !== $mime || $image[0] < 300 || $image[1] < 100 || $image[0] > 6000 || $image[1] > 6000 || $image[0] * $image[1] > 12000000)
            fail('INVALID_BANNER', 'Use a valid PNG, JPEG or WebP, at least 300 × 100 pixels and at most 12 megapixels.');
        return ['mime' => $mime, 'extension' => $types[$mime]];
    }

    public static function public(array $row, string $viewer): array
    {
        return ['id' => $row['id'], 'title' => $row['title'], 'target_url' => $row['target_url'],
            'banner_url' => '/api/backend'.(str_starts_with(parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH)??'', '/api/v1/')?'/api/v1':'').'/ads/banner?id=' . $row['id'], 'mine' => $row['user_id'] === $viewer,
            'status' => $row['status'] === 'active' && $row['expires_at'] <= now() ? 'expired' : $row['status'],
            'price_usd' => money((int)$row['price_cents']), 'created_at' => str_replace(' ', 'T', $row['created_at']) . 'Z',
            'expires_at' => str_replace(' ', 'T', $row['expires_at']) . 'Z'];
    }

    public static function listing(array $user): array
    {
        [$page, $limit] = paginate();
        $where = "a.status='active' AND a.expires_at>? AND u.status='active'";
        $rows = all('SELECT a.* FROM ads a JOIN users u ON u.id=a.user_id WHERE ' . $where . ' ORDER BY a.created_at DESC,a.id DESC LIMIT ' . $limit . ' OFFSET ' . (($page - 1) * $limit), [now()]);
        return ['items' => array_map(fn($row) => self::public($row, $user['id']), $rows),
            'mine' => array_map(fn($row) => self::public($row, $user['id']), all('SELECT * FROM ads WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [$user['id']])),
            'price_usd' => money(self::price()), 'duration' => '1 calendar month', 'page' => $page,
            'total' => (int)one('SELECT COUNT(*) n FROM ads a JOIN users u ON u.id=a.user_id WHERE ' . $where, [now()])['n'], 'per_page' => $limit];
    }

    public static function create(array $user, array $input, string $file, string $key): array
    {
        if(($input['terms_version']??null)!=='2026-10-24')fail('TERMS_REQUIRED','Review and agree to the current Ads Terms before publishing.');
        if ($key === '' || strlen($key) > 100) fail('IDEMPOTENCY_REQUIRED', 'A valid Idempotency-Key is required.');
        $title = required($input, 'title', 160);
        if(mb_strlen($title)>40)fail('INVALID_TITLE','Use an ad title of at most 40 characters.');
        $target = self::target(required($input, 'target_url', 2048));
        $banner = self::banner($file);
        $hash = hash('sha256', json_encode([$title, $target, hash_file('sha256', $file), $input['max_price_usd'] ?? null]));
        $stored = null;
        try {
            return tx(function () use ($user, $input, $title, $target, $banner, $file, $key, $hash, &$stored) {
                one('SELECT user_id FROM wallets WHERE user_id=?' . lockSuffix(), [$user['id']]);
                $existing = one('SELECT * FROM ads WHERE user_id=? AND idempotency_key=?', [$user['id'], $key]);
                if ($existing) {
                    if ($existing['request_hash'] !== $hash) fail('IDEMPOTENCY_CONFLICT', 'This purchase key has different ad details.', 409);
                    return ['status' => 'completed', 'ad' => self::public($existing, $user['id'])];
                }
                $price = self::price();
                if (isset($input['max_price_usd']) && $price > cents($input['max_price_usd'])) fail('PRICE_EXCEEDS_MAX', 'The ad price has changed. Refresh before purchasing.');
                $id = id();
                Wallet::change($user['id'], 'purchase', -$price, 'ad-purchase:' . $id, 'Banner ad: 1 calendar month');
                $name = 'ad-' . $id . '.' . $banner['extension'];
                $stored = __DIR__ . '/../storage/' . $name;
                if (!copy($file, $stored)) fail('UPLOAD_FAILED', 'Your banner could not be saved. No payment was taken.', 503);
                query('INSERT INTO ads (id,user_id,title,target_url,banner_file,banner_mime,request_hash,idempotency_key,price_cents,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                    [$id, $user['id'], $title, $target, $name, $banner['mime'], $hash, $key, $price, 'active', now(), self::expiry()]);
                audit('ads_terms_accepted',$user['id'],['ad'=>$id,'terms_version'=>'2026-10-24','immediate_publication_requested'=>true]);
                return ['status' => 'completed', 'ad' => self::public(one('SELECT * FROM ads WHERE id=?', [$id]), $user['id'])];
            });
        } catch (\Throwable $error) {
            if ($stored && is_file($stored)) unlink($stored);
            throw $error;
        }
    }

    public static function remove(array $user, string $id, bool $confirmed): array
    {
        if (!$confirmed) fail('CONFIRMATION_REQUIRED', 'Confirm removal of your ad.');
        return tx(function () use ($user, $id) {
            one('SELECT user_id FROM wallets WHERE user_id=?' . lockSuffix(), [$user['id']]);
            $row = one('SELECT * FROM ads WHERE id=? AND user_id=?' . lockSuffix(), [$id, $user['id']]);
            if (!$row) fail('NOT_FOUND', 'Ad not found.', 404);
            query("UPDATE ads SET status='removed' WHERE id=?", [$id]);
            return ['status' => 'removed', 'message' => 'Ad removed. The original placement charge is not refunded.'];
        });
    }

    public static function image(array $user, string $id): array
    {
        $row = one('SELECT a.* FROM ads a JOIN users u ON u.id=a.user_id WHERE a.id=? AND u.status=?', [$id, 'active']);
        if (!$row || ($row['user_id'] !== $user['id'] && ($row['status'] !== 'active' || $row['expires_at'] <= now()))) fail('NOT_FOUND', 'Banner not found.', 404);
        return $row;
    }
}

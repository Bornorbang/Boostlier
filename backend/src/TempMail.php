<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__ . '/TempMailProvider.php';
require_once __DIR__ . '/Pricing.php';

final class TempMail
{
    public static function price(): int
    {
        $saved = Pricing::setting('service_prices');
        $value = isset($saved['temp_mail_cents']) ? (string)$saved['temp_mail_cents'] : env('TEMP_MAIL_PRICE_CENTS');
        if (!ctype_digit($value) || (int)$value < 1 || (int)$value > 100000000)
            fail('PRICING_UNCONFIGURED', 'Temporary email pricing has not been configured yet.', 503);
        return (int)$value;
    }

    public static function publicInbox(array $row): array
    {
        return ['id' => $row['id'], 'address' => $row['address'],
            'status' => $row['status'] === 'active' && $row['expires_at'] <= now() ? 'expired' : $row['status'],
            'price_paid_usd' => money((int)$row['price_cents']),
            'created_at' => str_replace(' ', 'T', $row['created_at']) . 'Z',
            'expires_at' => str_replace(' ', 'T', $row['expires_at']) . 'Z'];
    }

    public static function listing(array $user): array
    {
        $price = null;
        try { $price = money(self::price()); } catch (Problem) {}
        return ['items' => array_map([self::class, 'publicInbox'], all("SELECT * FROM inboxes WHERE user_id=? AND status<>'deleted' ORDER BY created_at DESC", [$user['id']])),
            'balance_usd' => Wallet::balance($user['id'])['balance_usd'], 'price_usd' => $price,
            'duration_hours' => 24, 'configured' => (bool)env('RAPIDAPI_TEMP_MAIL_KEY') && $price !== null];
    }

    public static function owned(string $uid, string $id, bool $active = true, bool $lock = false): array
    {
        $row = one('SELECT * FROM inboxes WHERE id=? AND user_id=?' . ($lock ? lockSuffix() : ''), [$id, $uid]);
        if (!$row || $row['status'] === 'deleted') fail('NOT_FOUND', 'Inbox not found.', 404);
        if ($active && ($row['status'] !== 'active' || $row['expires_at'] <= now())) fail('INBOX_EXPIRED', 'This inbox has expired. Generate a new address to receive messages.', 410);
        return $row;
    }

    private static function key(string $key): void
    {
        if ($key === '' || strlen($key) > 100) fail('IDEMPOTENCY_REQUIRED', 'A valid Idempotency-Key is required.');
    }

    private static function existing(string $uid, string $key, string $hash): ?array
    {
        $row = one('SELECT * FROM temp_mail_operations WHERE user_id=? AND idempotency_key=?', [$uid, $key]);
        if ($row && $row['request_hash'] !== $hash) fail('IDEMPOTENCY_CONFLICT', 'This operation key has different input.', 409);
        return $row;
    }

    private static function result(array $operation): array
    {
        return ['id' => $operation['id'], 'status' => $operation['status'], 'inbox_id' => $operation['inbox_id'],
            'price_usd' => money((int)$operation['price_cents']), 'error_code' => $operation['error_code'],
            'message' => $operation['status'] === 'rejected' ? 'The email provider could not generate an address. Your reserved funds were returned.' : null];
    }

    private static function checkPrice(int $price, array $input): void
    {
        if (isset($input['max_price_usd']) && $price > cents($input['max_price_usd'])) fail('PRICE_EXCEEDS_MAX', 'The price has changed. Refresh before purchasing.');
    }

    public static function create(array $user, array $input, string $key, ?TempMailProvider $provider = null): array
    {
        self::key($key);
        $hash = hash('sha256', json_encode(['create', $input['max_price_usd'] ?? null]));
        $operation = tx(function () use ($user, $input, $key, $hash) {
            one('SELECT user_id FROM wallets WHERE user_id=?' . lockSuffix(), [$user['id']]);
            if ($existing = self::existing($user['id'], $key, $hash)) return $existing;
            $price = self::price();
            self::checkPrice($price, $input);
            $id = id();
            Wallet::change($user['id'], 'reservation', 0, 'temp-mail-reserve:' . $id, 'Reserve temporary email', $price);
            query('INSERT INTO temp_mail_operations (id,user_id,idempotency_key,operation,request_hash,price_cents,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
                [$id, $user['id'], $key, 'create', $hash, $price, 'pending', now(), now()]);
            return one('SELECT * FROM temp_mail_operations WHERE id=?', [$id]);
        });
        return self::finishCreate($operation, $provider);
    }

    public static function recover(string $id, ?TempMailProvider $provider = null): array
    {
        $operation = one('SELECT * FROM temp_mail_operations WHERE id=?', [$id]);
        if (!$operation || $operation['operation'] !== 'create') fail('NOT_FOUND', 'Generation operation not found.', 404);
        return self::finishCreate($operation, $provider);
    }

    private static function finishCreate(array $operation, ?TempMailProvider $provider): array
    {
        if ($operation['status'] !== 'pending') return self::result($operation);
        try {
            $domains = ($provider ?? new TempMailProvider())->domains();
        } catch (\Throwable $error) {
            // There is no remote create request: a domain lookup failure definitively created no mailbox.
            tx(function () use ($operation, $error) {
                one('SELECT user_id FROM wallets WHERE user_id=?' . lockSuffix(), [$operation['user_id']]);
                $current = one('SELECT * FROM temp_mail_operations WHERE id=?' . lockSuffix(), [$operation['id']]);
                if ($current['status'] !== 'pending') return;
                Wallet::change($current['user_id'], 'release', 0, 'temp-mail-release:' . $current['id'], 'Temporary email generation failed', -(int)$current['price_cents']);
                query("UPDATE temp_mail_operations SET status='rejected',error_code=?,updated_at=? WHERE id=?", [$error instanceof Problem ? $error->key : 'TEMP_MAIL_PROVIDER_ERROR', now(), $current['id']]);
            });
            return self::result(one('SELECT * FROM temp_mail_operations WHERE id=?', [$operation['id']]));
        }
        return tx(function () use ($operation, $domains) {
            one('SELECT user_id FROM wallets WHERE user_id=?' . lockSuffix(), [$operation['user_id']]);
            $current = one('SELECT * FROM temp_mail_operations WHERE id=?' . lockSuffix(), [$operation['id']]);
            if ($current['status'] !== 'pending') return self::result($current);
            $address = 'b' . $current['id'] . '@' . $domains[hexdec(substr($current['id'], 0, 6)) % count($domains)];
            $inboxId = id();
            query('INSERT INTO inboxes (id,user_id,provider_id,address,status,price_cents,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
                [$inboxId, $current['user_id'], md5($address), $address, 'active', $current['price_cents'], gmdate('Y-m-d H:i:s', time() + 86400), now()]);
            Wallet::change($current['user_id'], 'purchase', -(int)$current['price_cents'], 'temp-mail-capture:' . $current['id'], 'Temporary email: 24 hours', -(int)$current['price_cents']);
            query("UPDATE temp_mail_operations SET status='completed',inbox_id=?,updated_at=? WHERE id=?", [$inboxId, now(), $current['id']]);
            return self::result(one('SELECT * FROM temp_mail_operations WHERE id=?', [$current['id']]));
        });
    }

    public static function renew(array $user, string $id, array $input, string $key): array
    {
        self::key($key);
        // The client's expiry version also makes simultaneous clicks across tabs idempotent.
        $hash = hash('sha256', json_encode(['renew', $id, $input['expires_at'] ?? null, $input['max_price_usd'] ?? null]));
        return tx(function () use ($user, $id, $input, $key, $hash) {
            one('SELECT user_id FROM wallets WHERE user_id=?' . lockSuffix(), [$user['id']]);
            if ($existing = self::existing($user['id'], $key, $hash)) return self::result($existing);
            $row = self::owned($user['id'], $id, true, true);
            if (isset($input['expires_at']) && $input['expires_at'] !== str_replace(' ', 'T', $row['expires_at']) . 'Z') fail('INBOX_CHANGED', 'This inbox has changed. Refresh before renewing.', 409);
            $price = self::price();
            self::checkPrice($price, $input);
            $operation = id();
            Wallet::change($user['id'], 'renewal', -$price, 'temp-mail-renew:' . $operation, 'Temporary email renewal: 24 hours');
            $expiry = gmdate('Y-m-d H:i:s', strtotime($row['expires_at'] . ' UTC') + 86400);
            query('UPDATE inboxes SET expires_at=? WHERE id=?', [$expiry, $id]);
            query('INSERT INTO temp_mail_operations (id,user_id,idempotency_key,operation,inbox_id,request_hash,price_cents,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$operation, $user['id'], $key, 'renew', $id, $hash, $price, 'completed', now(), now()]);
            return self::result(one('SELECT * FROM temp_mail_operations WHERE id=?', [$operation]));
        });
    }

    public static function delete(array $user, string $id, bool $confirmed): array
    {
        if (!$confirmed) fail('CONFIRMATION_REQUIRED', 'Confirm deletion of this inbox.');
        return tx(function () use ($user, $id) {
            one('SELECT user_id FROM wallets WHERE user_id=?' . lockSuffix(), [$user['id']]);
            $row = one('SELECT * FROM inboxes WHERE id=? AND user_id=?' . lockSuffix(), [$id, $user['id']]);
            if (!$row) fail('NOT_FOUND', 'Inbox not found.', 404);
            query("UPDATE inboxes SET status='deleted' WHERE id=?", [$id]);
            return ['status' => 'deleted', 'message' => 'Inbox deleted. Access has been revoked.'];
        });
    }

    public static function messages(array $user, string $id, ?string $messageId = null, ?TempMailProvider $provider = null): array
    {
        $row = self::owned($user['id'], $id);
        $provider ??= new TempMailProvider();
        $result = $messageId === null ? ['items' => array_map(function ($message) { unset($message['text']); return $message; }, $provider->messages($row['provider_id']))] : $provider->message($row['provider_id'], $messageId);
        self::owned($user['id'], $id); // Revoke access even if expiry/deletion happened during the provider request.
        return $result;
    }
}

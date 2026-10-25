<?php
declare(strict_types=1);
namespace TempNumber;
final class DashboardNotice
{
    public static function read(): array
    {
        $row = one('SELECT value,updated_at FROM settings WHERE name=?', ['dashboard_notice']);
        $value = $row ? json_decode($row['value'], true) : [];
        return ['text' => (string)($value['text'] ?? ''), 'updated_at' => $row['updated_at'] ?? null];
    }

    public static function save(array $actor, array $input): array
    {
        if (($actor['role'] ?? '') !== 'admin' || ($actor['status'] ?? '') !== 'active' || !empty($actor['impersonator_id'])) fail('FORBIDDEN', 'Administrator access is required.', 403);
        if (!is_string($input['text'] ?? null)) fail('VALIDATION_ERROR', 'Enter notice text.');
        $text = preg_replace('/\s+/u', ' ', trim($input['text']));
        if ($text === null || mb_strlen($text) > 1000) fail('VALIDATION_ERROR', 'Use at most 1,000 characters.');
        tx(function () use ($actor, $text) {
            $value = json_encode(['text' => $text], JSON_THROW_ON_ERROR);
            $time = now();
            $sql = 'INSERT INTO settings (name,value,updated_at) VALUES (?,?,?)';
            if (db()->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'mysql') {
                query($sql . ' ON DUPLICATE KEY UPDATE value=?,updated_at=?', ['dashboard_notice', $value, $time, $value, $time]);
            } else {
                query($sql . ' ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', ['dashboard_notice', $value, $time]);
            }
            audit('dashboard_notice_updated', $actor['id'], ['text' => $text]);
        });
        return self::read() + ['message' => $text === '' ? 'Dashboard notice hidden.' : 'Dashboard notice saved.'];
    }
}

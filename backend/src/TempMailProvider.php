<?php
declare(strict_types=1);
namespace TempNumber;

/** Privatix RapidAPI v1: addresses are generated locally; only message retrieval is remote. */
final class TempMailProvider
{
    private const HOST = 'privatix-temp-mail-v1.p.rapidapi.com';
    private ?\Closure $transport;

    public function __construct(?callable $transport = null)
    {
        $this->transport = $transport ? \Closure::fromCallable($transport) : null;
    }

    private function request(string $path, bool $allowEmpty = false): array
    {
        if ($this->transport) {
            $response = ($this->transport)($path);
            $http = 200;
        } else {
            if (!env('RAPIDAPI_TEMP_MAIL_KEY')) fail('TEMP_MAIL_UNCONFIGURED', 'Temporary email is not connected yet.', 503);
            $curl = curl_init('https://' . self::HOST . $path);
            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-RapidAPI-Host: ' . self::HOST,
                    'X-RapidAPI-Key: ' . env('RAPIDAPI_TEMP_MAIL_KEY')],
            ]);
            if (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA')) curl_setopt($curl, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
            $raw = curl_exec($curl);
            $http = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            curl_close($curl);
            if (!is_string($raw) || $http === 0) fail('TEMP_MAIL_PROVIDER_UNAVAILABLE', 'The email provider could not be reached. Please retry.', 503);
            $response = json_decode($raw, true);
        }
        // This exact provider error denotes an empty inbox; other errors must remain errors.
        if ($allowEmpty && in_array($http, [200, 404], true) && is_array($response)
            && ($response['error'] ?? null) === 'There are no emails yet') return [];
        if ($http === 429) fail('TEMP_MAIL_PROVIDER_RATE_LIMITED', 'The email provider is busy. Please wait before refreshing.', 429);
        if (in_array($http, [401, 403], true)) fail('TEMP_MAIL_PROVIDER_ACCESS', 'The email provider connection needs attention. Please try again later.', 503);
        if (!is_array($response) || $http >= 400 || !empty($response['error']) || isset($response['message']))
            fail('TEMP_MAIL_PROVIDER_ERROR', 'The email provider could not complete this request. Please retry later.', 503);
        return $response;
    }

    public function domains(): array
    {
        $response = $this->request('/request/domains/');
        if (!array_is_list($response)) fail('TEMP_MAIL_PROVIDER_ERROR', 'The email provider returned an invalid domain list.', 503);
        $domains = [];
        foreach ($response as $domain) {
            if (!is_string($domain)) continue;
            $domain = strtolower(ltrim(trim($domain), '@'));
            if (filter_var('test@' . $domain, FILTER_VALIDATE_EMAIL) && !str_contains($domain, '@')) $domains[] = $domain;
        }
        if (!$domains) fail('TEMP_MAIL_PROVIDER_ERROR', 'No temporary email domains are currently available.', 503);
        return array_values(array_unique($domains));
    }

    public static function plain(string $value): string
    {
        $value = preg_replace('~<(script|style)\b[^>]*>.*?</\1>~is', '', $value);
        $value = preg_replace('~<br\s*/?>|</(?:p|div|li)>~i', "\n", $value);
        return trim(html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    private static function normalise(array $row): array
    {
        $id = (string)($row['mail_id'] ?? $row['_id'] ?? '');
        if (!preg_match('/^[a-zA-Z0-9_-]{1,120}$/D', $id)) fail('TEMP_MAIL_PROVIDER_ERROR', 'The email provider returned an invalid message.', 503);
        $text = self::plain((string)($row['mail_text'] ?? $row['mail_html'] ?? ''));
        return ['id' => $id, 'sender' => self::plain((string)($row['mail_from'] ?? 'Unknown sender')),
            'subject' => self::plain((string)($row['mail_subject'] ?? 'No subject')),
            'preview' => mb_substr(self::plain((string)($row['mail_preview'] ?? $text)), 0, 240), 'text' => $text];
    }

    public function messages(string $mailbox): array
    {
        if (!preg_match('/^[a-f0-9]{32}$/D', $mailbox)) fail('INVALID_MAILBOX', 'Invalid mailbox identifier.');
        $rows = $this->request('/request/mail/id/' . $mailbox . '/', true);
        if (!array_is_list($rows)) fail('TEMP_MAIL_PROVIDER_ERROR', 'The email provider returned an invalid inbox.', 503);
        return array_map(fn(array $row) => self::normalise($row), $rows);
    }

    public function message(string $mailbox, string $messageId): array
    {
        // The single-message endpoint is global: establish membership using this mailbox first.
        $messages = $this->messages($mailbox);
        if (!in_array($messageId, array_column($messages, 'id'), true)) fail('MESSAGE_NOT_FOUND', 'This message is not in the selected inbox.', 404);
        $response = $this->request('/request/one_mail/id/' . rawurlencode($messageId) . '/');
        $row = array_is_list($response) ? ($response[0] ?? []) : $response;
        if (isset($row['mail_address_id']) && $row['mail_address_id'] !== $mailbox) fail('MESSAGE_NOT_FOUND', 'This message is not in the selected inbox.', 404);
        $message = self::normalise($row);
        if ($message['id'] !== $messageId) fail('MESSAGE_NOT_FOUND', 'This message is not in the selected inbox.', 404);
        return $message;
    }
}

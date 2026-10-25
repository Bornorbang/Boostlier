<?php
declare(strict_types=1);
namespace TempNumber;
if (!in_array($route, ['/api/temp-mail', '/temp-mail'], true) && !str_starts_with($route, '/temp-mail/')) return;
$action = (string)($_GET['action'] ?? (str_contains(substr($route, 1), '/') && $route !== '/api/temp-mail' ? basename($route) : 'status'));
if ($action === 'purchase') $action = 'create';
if ($method === 'GET' && $action === 'status') json(TempMail::listing($u));
if ($method === 'GET' && in_array($action, ['messages', 'message'], true)) {
    rateLimit('temp-mail-read:' . $u['id'], 30, 60);
    $id = required(['inbox_id' => $_GET['inbox_id'] ?? $_GET['id'] ?? ''], 'inbox_id', 32);
    json(TempMail::messages($u, $id, $action === 'message' ? required($_GET, 'message_id', 120) : null));
}
if ($method === 'POST' && in_array($action, ['create', 'renew', 'delete'], true)) {
    rateLimit('temp-mail-write:' . $u['id'], 20, 60);
    $input = body();
    $id = $action === 'create' ? '' : required(['id' => $_GET['id'] ?? $input['id'] ?? ''], 'id', 32);
    $key = $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '';
    if ($action === 'create') json(TempMail::create($u, $input, $key));
    if ($action === 'renew') json(TempMail::renew($u, $id, $input, $key));
    json(TempMail::delete($u, $id, ($input['confirmed'] ?? false) === true));
}
fail('NOT_FOUND', 'Temporary email action not found.', 404);

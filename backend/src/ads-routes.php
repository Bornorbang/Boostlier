<?php
declare(strict_types=1);
namespace TempNumber;
if ($route === '/ads' && $method === 'GET') json(Ads::listing($u));
if ($route === '/ads/create' && $method === 'POST') {
    rateLimit('ads-create:' . $u['id'], 10, 60);
    $file = $_FILES['banner'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) fail('INVALID_BANNER', 'Choose a banner image of at most 2 MB.');
    json(Ads::create($u, $_POST, $file['tmp_name'], $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? ''), 201);
}
if ($route === '/ads/remove' && $method === 'POST') {
    $input = body();
    json(Ads::remove($u, required($input, 'id', 32), ($input['confirmed'] ?? false) === true));
}
if ($route === '/ads/banner' && $method === 'GET') {
    $row = Ads::image($u, required($_GET, 'id', 32));
    $file = __DIR__ . '/../storage/' . basename($row['banner_file']);
    if (!is_file($file)) fail('NOT_FOUND', 'Banner not found.', 404);
    header('Content-Type: ' . $row['banner_mime']);
    header('Content-Disposition: inline'); header('Cache-Control: private, no-store');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    readfile($file); exit;
}

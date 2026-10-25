<?php
declare(strict_types=1);
namespace TempNumber;
// Explicit public API surface. Session credentials and administrator operations
// must never become reachable merely by adding a dashboard route.
$allowed = [
 'GET'=>['/numbers/services','/global-numbers/countries','/global-numbers/services','/global-numbers/prices','/number-rentals','/number-rentals/catalogue','/number-rentals/messages','/smm/catalogue','/smm/orders','/temp-mail','/temp-mail/messages','/temp-mail/message'],
 'POST'=>['/numbers/quote','/number-rentals/quote','/number-rentals/purchase','/number-rentals/extend','/number-rentals/status','/number-rentals/cancel','/number-rentals/recover','/smm/quote','/smm/purchase','/smm/status','/smm/refill','/smm/refill-status','/temp-mail/create','/temp-mail/renew','/temp-mail/delete'],
];
if(!in_array($route,$allowed[$method]??[],true))return;
if($route==='/smm/orders')json(SmmOrders::listing($u));
require __DIR__.'/temp-mail-routes.php';
require __DIR__.'/number-routes.php';
require __DIR__.'/global-number-routes.php';
require __DIR__.'/number-rental-routes.php';
require __DIR__.'/commerce-routes.php';

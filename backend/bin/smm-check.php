<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';
foreach(['Wallet','Pricing','Providers','Commerce','SmmOrders'] as $file) require_once __DIR__.'/../src/'.$file.'.php';
try {
    $provider=new SmmProvider();
    $balance=$provider->request('balance');
    if (($balance['currency']??'')!=='NGN') fail('INVALID_PROVIDER_CURRENCY','Provider currency was not NGN.',409);
    $catalogue=$provider->catalogue('smm');
    $types=[];
    foreach($catalogue['items'] as $service) $types[$service['type']]=($types[$service['type']]??0)+1;
    echo json_encode(['connected'=>true,'currency'=>'NGN','services'=>count($catalogue['items']),'types'=>$types,'pricing_configured'=>$catalogue['pricing_configured']],JSON_PRETTY_PRINT).PHP_EOL;
} catch(Problem $error) {fwrite(STDERR,$error->key.': '.$error->getMessage().PHP_EOL);exit(1);}

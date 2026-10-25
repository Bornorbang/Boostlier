<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';foreach(['Wallet','Pricing','Providers','Rentals']as$file)require_once __DIR__.'/../src/'.$file.'.php';
try{$provider=provider('5sim');$provider->request('/user/profile',true);$services=$provider->services();$prices=$provider->prices($argv[1]??'facebook',Pricing::setting('5sim_pricing'));echo json_encode(['connected'=>true,'services'=>count($services),'countries_with_rated_stock'=>count($prices['items']),'best_country'=>$prices['best_country'],'sample'=>array_slice($prices['items'],0,2)],JSON_PRETTY_PRINT).PHP_EOL;}
catch(Problem$e){fwrite(STDERR,$e->key.': '.$e->getMessage().PHP_EOL);exit(1);}

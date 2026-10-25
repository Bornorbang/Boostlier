<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';
foreach(['Wallet','Pricing','Providers','Commerce']as$file)require_once __DIR__.'/../src/'.$file.'.php';
try{
 $provider=Commerce::adapter('long-term');$catalogue=$provider->catalogue('long-term');
 $result=['connected'=>true,'services'=>count($catalogue['items']),'durations'=>$catalogue['durations']];
 if(isset($argv[1])){$quote=$provider->quote('long-term',['service'=>$argv[1],'duration'=>$argv[2]??'sevenDay'],null);$result+=['service'=>$argv[1],'price_usd'=>money(Commerce::price('long-term',$quote))];}
 echo json_encode($result,JSON_PRETTY_PRINT).PHP_EOL;
}catch(Problem $e){fwrite(STDERR,$e->key.': '.$e->getMessage().PHP_EOL);exit(1);}

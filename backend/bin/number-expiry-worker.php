<?php
declare(strict_types=1);
namespace TempNumber;
if(PHP_SAPI!=='cli')exit(1);
require __DIR__.'/../src/bootstrap.php';
require __DIR__.'/../src/Wallet.php';
require __DIR__.'/../src/Rentals.php';
$lock=fopen(__DIR__.'/../storage/number-expiry.lock','c');
if(!flock($lock,LOCK_EX|LOCK_NB))exit(0);
try{
 do{
  try{$count=Rentals::expireDue();if($count)echo json_encode(['number_refunds'=>$count,'at'=>now()]).PHP_EOL;}
  catch(\Throwable $error){fwrite(STDERR,get_class($error).': number expiry processing deferred.'.PHP_EOL);}
  if(in_array('--watch',$argv,true))sleep(5);
 }while(in_array('--watch',$argv,true));
}finally{flock($lock,LOCK_UN);fclose($lock);}

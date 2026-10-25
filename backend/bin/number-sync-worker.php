<?php
declare(strict_types=1);
namespace TempNumber;
if(PHP_SAPI!=='cli')exit(1);
require __DIR__.'/../src/bootstrap.php';
foreach(['Wallet','Pricing','Providers','Rentals','Commerce','NumberSync']as$file)require_once __DIR__.'/../src/'.$file.'.php';
$lock=fopen(__DIR__.'/../storage/number-sync.lock','c');
if(!flock($lock,LOCK_EX|LOCK_NB))exit(0);
try{do{
    try{$result=NumberSync::run();if($result['synced']||$result['deferred'])echo json_encode($result+['at'=>now()]).PHP_EOL;}
    catch(\Throwable){fwrite(STDERR,"Number synchronization deferred.\n");}
    if(in_array('--watch',$argv,true))sleep(15);
}while(in_array('--watch',$argv,true));}
finally{flock($lock,LOCK_UN);fclose($lock);}

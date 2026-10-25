<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';require __DIR__.'/../src/Wallet.php';require __DIR__.'/../src/Payments.php';
$watch=in_array('--watch',$argv,true);
do {
 $lock=fopen(__DIR__.'/../storage/payment-worker.lock','c');
 if($lock&&flock($lock,LOCK_EX|LOCK_NB)){
  $summary=['checked'=>0,'deferred'=>0];
  try{
   foreach(all("SELECT * FROM payments WHERE provider IN ('stripe','flutterwave') AND status='pending' AND updated_at<? ORDER BY updated_at LIMIT 10",[gmdate('Y-m-d H:i:s',time()-30)])as$p){
    if(($p['provider']==='stripe'&&!env('STRIPE_SECRET_KEY'))||($p['provider']==='flutterwave'&&!env('FLW_SECRET_KEY')))continue;
    try{Payments::verify($p['id']);$summary['checked']++;}catch(\Throwable){$summary['deferred']++;}
    query('UPDATE payments SET updated_at=? WHERE id=?',[now(),$p['id']]);
   }
   if(!$watch||array_sum($summary))echo json_encode($summary).PHP_EOL;
  }catch(\Throwable){fwrite(STDERR,"Payment worker unavailable; check database/configuration.\n");}
  finally{flock($lock,LOCK_UN);fclose($lock);}
 }
 if($watch)sleep(15);
}while($watch);

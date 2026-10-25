<?php
declare(strict_types=1);
namespace TempNumber;
if(($argv[1]??'')==='worker'){
 require __DIR__.'/../src/bootstrap.php';require __DIR__.'/../src/Wallet.php';require __DIR__.'/../src/Rentals.php';
 for($attempt=0;$attempt<30;$attempt++){
  try{Rentals::expireDue($argv[2]);exit(0);}
  catch(\PDOException $error){if(!str_contains($error->getMessage(),'locked')&&!str_contains($error->getMessage(),'busy'))throw $error;}
  usleep(random_int(1000,25000));
 }
 exit(1);
}
$file=__DIR__.'/../storage/refund-concurrency-'.bin2hex(random_bytes(8)).'.sqlite';putenv('DB_DSN=sqlite:'.$file);
require __DIR__.'/../src/bootstrap.php';require __DIR__.'/../src/Wallet.php';
foreach(glob(__DIR__.'/../migrations/*.sql')as$f)db()->exec(file_get_contents($f));
$uid=id();$order=id();
query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$uid,'Refund QA','refund@example.invalid','unused',id(),now()]);
query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,1000)',[$uid]);
query('INSERT INTO orders (id,user_id,provider,provider_order_id,product,service,status,price_cents,price_tier,idempotency_key,request_hash,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$order,$uid,'textverified','fixture-only','usa','google','active',320,'retail',id(),'hash',gmdate('Y-m-d H:i:s',time()-1),now(),now()]);
tx(fn()=>Wallet::change($uid,'purchase',-320,'purchase:'.$order,'Test original charge'));
$children=[];
for($i=0;$i<12;$i++){
 $pipes=[];$process=proc_open([PHP_BINARY,__FILE__,'worker',$uid],[1=>['pipe','w'],2=>['pipe','w']],$pipes);$children[]=[$process,$pipes];
}
foreach($children as[$process,$pipes]){stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($process)!==0)throw new \RuntimeException($error?:'Refund worker failed.');}
$refund=one('SELECT COUNT(*) n,COALESCE(SUM(amount_cents),0) amount FROM ledger WHERE reference=?',['refund:'.$order]);
if(Wallet::balance($uid)['balance_usd']!=='10.00'||(int)$refund['n']!==1||(int)$refund['amount']!==320||one('SELECT status FROM orders WHERE id=?',[$order])['status']!=='expired')throw new \RuntimeException('Concurrent refund was not exactly once.');
echo "PASS 12 simultaneous expiry workers refund the original USD charge exactly once.\n";

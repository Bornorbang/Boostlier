<?php
declare(strict_types=1);
namespace TempNumber;
if(($argv[1]??'')==='worker'){
 require __DIR__.'/../src/bootstrap.php';foreach(['Wallet','Pricing','Rewards']as$f)require __DIR__.'/../src/'.$f.'.php';
 for($attempt=0;$attempt<30;$attempt++)try{Rewards::claim(one('SELECT * FROM users WHERE id=?',[$argv[2]]),'cashback');exit(0);}catch(Problem$e){if($e->key==='REWARD_INELIGIBLE')exit(0);throw$e;}catch(\PDOException$e){if(!str_contains($e->getMessage(),'locked')&&!str_contains($e->getMessage(),'busy'))throw$e;usleep(random_int(1000,25000));}exit(1);
}
$file=__DIR__.'/../storage/rewards-concurrency-'.bin2hex(random_bytes(8)).'.sqlite';putenv('DB_DSN=sqlite:'.$file);
require __DIR__.'/../src/bootstrap.php';foreach(['Wallet','RewardAccounting']as$f)require __DIR__.'/../src/'.$f.'.php';
foreach(glob(__DIR__.'/../migrations/*.sql')as$f)db()->exec(file_get_contents($f));
$uid=id();$order=id();query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$uid,'Rewards QA','reward@example.invalid','unused',id(),now()]);query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,10000)',[$uid]);
query('INSERT INTO orders (id,user_id,provider,product,service,status,price_cents,price_tier,idempotency_key,request_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[$order,$uid,'test','usa','test','completed',10000,'retail',id(),id(),now(),now()]);
tx(fn()=>Wallet::change($uid,'purchase',-10000,'purchase:'.$order,'Test order'));
RewardAccounting::record($order,$uid,$order,'usa','purchase:'.$order,['cost_minor'=>5000],['fx_numerator'=>1,'fx_denominator'=>1]);query("UPDATE reward_costs SET created_at='2020-01-01 00:00:00',settled_at='2020-01-01 00:00:00'");
$children=[];for($i=0;$i<12;$i++){$pipes=[];$process=proc_open([PHP_BINARY,__FILE__,'worker',$uid],[1=>['pipe','w'],2=>['pipe','w']],$pipes);$children[]=[$process,$pipes];}
foreach($children as[$process,$pipes]){stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($process)!==0)throw new \RuntimeException($error?:'Reward worker failed.');}
if(Wallet::balance($uid)['balance_usd']!=='1.00'||(int)one('SELECT COUNT(*) AS n FROM reward_claims')['n']!==1||(int)one("SELECT COUNT(*) AS n FROM ledger WHERE kind='bonus'")['n']!==1)throw new \RuntimeException('Concurrent reward credit was not exactly once.');
echo "PASS 12 simultaneous reward claims credit exactly once.\n";

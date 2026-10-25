<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:'); putenv('APP_ENV=testing'); putenv('TEXTVERIFIED_API_KEY=test-key'); putenv('TEXTVERIFIED_API_USERNAME=qa@example.invalid');
require __DIR__ . '/../src/bootstrap.php';
foreach (['Wallet','Pricing','Providers','Rentals','TextVerifiedProvider'] as $file) require __DIR__ . '/../src/' . $file . '.php';
foreach (glob(__DIR__ . '/../migrations/*.sql') as $file) db()->exec(file_get_contents($file));
$config = ['currency'=>'USD','fx_numerator'=>1,'fx_denominator'=>1,'fx_updated_at'=>now(),'fx_mode'=>'fixed','retail_margin_cents'=>70,'wholesale_margin_cents'=>70];
query("DELETE FROM settings WHERE name='textverified_pricing'");
query('INSERT INTO settings (name,value,updated_at) VALUES (?,?,?)', ['textverified_pricing',json_encode($config),now()]);
$passed = 0;
function eq(mixed $a,mixed $b):void { if ($a !== $b) throw new \RuntimeException(var_export($a,true).' !== '.var_export($b,true)); }
function test(string $name,callable $fn):void { global $passed; foreach(['reward_costs','messages','provider_receipts','number_provider_requests','orders','ledger','wallets','users']as$table)query('DELETE FROM '.$table); $fn(); $passed++; echo "PASS $name\n"; }
function rejects(callable $fn,string $code):void { try {$fn();} catch(Problem $e) {eq($e->key,$code);return;} throw new \RuntimeException('Expected '.$code); }
function customer(int $funds=1000):array { $id=id(); query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$id,'Number QA',$id.'@example.invalid','unused',id(),now()]); query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,?)',[$id,$funds]); return ['id'=>$id]; }
function input():array { return ['catalogue'=>'usa','country'=>'usa','service'=>'google','max_price_usd'=>'3.20']; }
function details(string $state='verificationPending',string $id='verification-1'):array {return ['id'=>$id,'number'=>'12025550123','serviceName'=>'google','endsAt'=>'2099-01-01T12:00:00Z','state'=>$state,'cancel'=>['canCancel'=>true],'totalCost'=>2.50];}
function adapter(?callable $override=null):TextVerifiedProvider {
 return new TextVerifiedProvider(function($method,$url,$body,$headers)use($override){
  $path=parse_url($url,PHP_URL_PATH);$query=parse_url($url,PHP_URL_QUERY)??'';
  if($override){$result=$override($method,$path,$body,$headers,$query);if($result!==null)return $result;}
  $data=match($path){
   '/api/pub/v2/auth'=>['token'=>'test-token','expiresAt'=>'2099-01-01T00:00:00Z'],
   '/api/pub/v2/services'=>[['serviceName'=>'google','description'=>'Google','capability'=>'Sms'],['serviceName'=>'voice','description'=>'Voice','capability'=>'voice'],['serviceName'=>'test_success','capability'=>'sms']],
   '/api/pub/v2/inventory/verifications'=>['availableQuantity'=>37],
   '/api/pub/v2/pricing/verifications'=>['serviceName'=>'google','price'=>2.50],
   '/api/pub/v2/verifications'=>['href'=>'https://backend.textverified.com/api/pub/v2/verifications/verification-1','method'=>'GET'],
   '/api/pub/v2/verifications/verification-1'=>details(),
   '/api/pub/v2/sms'=>['data'=>[],'hasNext'=>false],
   '/api/pub/v2/verifications/verification-1/cancel'=>[],
   default=>throw new \RuntimeException('Unexpected endpoint '.$path),
  };
  return ['http'=>$path==='/api/pub/v2/verifications'?201:200,'data'=>$data,'headers'=>[]];
 });
}
test('Custom 70 cent margin produces USD 3.20',function()use($config){eq(Pricing::numberQuote(250,'textverified',$config),320);eq(Pricing::numberQuote(75,'textverified',$config),145);});
test('Pricing converts fractional USD cents upwards without undercharging',function(){eq(TextVerifiedProvider::cents('2.50'),250);eq(TextVerifiedProvider::cents('0.750001'),76);rejects(fn()=>TextVerifiedProvider::cents(-1),'INVALID_PROVIDER_PRICE');});
test('Service catalogue accepts live Pascal-case capability and hides voice/mock services',function(){eq(adapter()->catalogue('usa')['items'],[['id'=>'google','service'=>'Google','capability'=>'sms']]);});
test('Unsupported countries, services and options are rejected',function(){rejects(fn()=>adapter()->catalogue('uk'),'INVALID_COUNTRY');rejects(fn()=>adapter()->quote('test_success','usa',[]),'SERVICE_UNAVAILABLE');rejects(fn()=>adapter()->quote('google','usa',['carrier'=>'x']),'UNSUPPORTED_OPTIONS');});
test('Stock and current price are checked using documented SMS request fields',function(){
 $p=adapter(function($method,$path,$body){if(str_contains($path,'inventory/verifications'))eq($body,['serviceName'=>'google','numberType'=>'mobile','capability'=>'sms']);if(str_contains($path,'pricing/verifications'))eq($body['areaCode'],false);return null;});
 $quote=$p->quote('google','usa',[]);eq($quote['cost_minor'],250);eq($quote['stock'],37);
});
test('Table pricing checks prices without purchasing or requesting inventory',function(){
 $inventory=0;$purchases=0;$p=adapter(function($method,$path)use(&$inventory,&$purchases){if(str_contains($path,'inventory/'))$inventory++;if($path==='/api/pub/v2/verifications')$purchases++;return null;});
 $price=$p->displayPrice('google');eq($price['cost_minor'],250);eq($inventory,0);eq($purchases,0);
});
test('Zero inventory prevents quoting or charging',function(){rejects(fn()=>adapter(fn($m,$p)=>str_contains($p,'inventory/verifications')?['http'=>200,'data'=>['availableQuantity'=>0],'headers'=>[]]:null)->quote('google','usa',[]),'OUT_OF_STOCK');});
test('Follow-up URLs reject foreign hosts, credentials, HTTP and traversal',function(){foreach(['https://evil.example/api/pub/v2/x','http://www.textverified.com/api/pub/v2/x','https://user:pass@www.textverified.com/api/pub/v2/x','https://www.textverified.com/api/pub/v2/../auth','https://www.textverified.com/api/pub/v2/%2e%2e/auth']as$url)rejects(fn()=>TextVerifiedProvider::safeUrl($url),'INVALID_PROVIDER_LINK');eq(TextVerifiedProvider::safeUrl('/api/pub/v2/verifications/abc'),'https://www.textverified.com/api/pub/v2/verifications/abc');});
test('Number purchase captures one USD charge and sends stable vendor idempotency and price cap',function(){
 $u=customer();$calls=0;$sent=[];$p=adapter(function($method,$path,$body,$headers)use(&$calls,&$sent){if($path==='/api/pub/v2/verifications'){$calls++;$sent=$headers;eq($body['maxPrice'],2.5);}return null;});
 $key=id();$a=Rentals::purchase($u,input(),$key,false,$p);$b=Rentals::purchase($u,input(),$key,false,$p);
 eq($a['id'],$b['id']);eq($a['status'],'active');eq($calls,1);eq($a['phone'],'12025550123');eq($a['provider'],'textverified');eq($a['price_usd'],'3.20');eq(Wallet::balance($u['id'])['balance_usd'],'6.80');eq(in_array('Idempotency-Key: boostlier-'.$a['id'],$sent,true),true);
});
test('Insufficient wallet funds stop before provider purchase',function(){
 $u=customer(319);$calls=0;$p=adapter(function($m,$path)use(&$calls){if($path==='/api/pub/v2/verifications')$calls++;return null;});
 rejects(fn()=>Rentals::purchase($u,input(),id(),false,$p),'INSUFFICIENT_FUNDS');eq($calls,0);
});
test('Maximum USD price blocks provider dispatch',function(){ $u=customer();$input=input();$input['max_price_usd']='3.19';rejects(fn()=>Rentals::purchase($u,$input,id(),false,adapter()),'PRICE_EXCEEDS_MAX'); });
test('Definitive provider rejection releases reserved funds once',function(){
 $u=customer();$p=adapter(fn($m,$path)=>$path==='/api/pub/v2/verifications'?['http'=>400,'data'=>['errorCode'=>'Unavailable'],'headers'=>[]]:null);
 $key=id();$result=Rentals::purchase($u,input(),$key,false,$p);eq($result['status'],'cancelled');Rentals::purchase($u,input(),$key,false,$p);eq(Wallet::balance($u['id'])['balance_usd'],'10.00');eq(Wallet::balance($u['id'])['reserved_usd'],'0.00');
 eq((int)one("SELECT COUNT(*) n FROM ledger WHERE user_id=? AND kind='release'",[$u['id']])['n'],1);
});
test('Ambiguous purchase stays reserved and recovery reuses exactly the same vendor key',function(){
 $u=customer();$keys=[];$attempts=0;$p=adapter(function($m,$path,$body,$headers)use(&$keys,&$attempts){if($path==='/api/pub/v2/verifications'){$keys[]=array_values(array_filter($headers,fn($h)=>str_starts_with($h,'Idempotency-Key:')))[0];if(++$attempts===1)throw new AmbiguousProvisioning('Mock timeout');}return null;});
 $result=Rentals::purchase($u,input(),id(),false,$p);eq($result['status'],'reconciliation');eq(Wallet::balance($u['id'])['reserved_usd'],'3.20');
 $recovered=$p->findIntent($result['id']);eq($recovered['outcome'],'provisioned');eq($keys[0],$keys[1]);
});
test('Acknowledged purchase with failed details recovers using saved link without another POST',function(){
 $u=customer();$posts=0;$gets=0;$p=adapter(function($m,$path)use(&$posts,&$gets){if($path==='/api/pub/v2/verifications')$posts++;if($path==='/api/pub/v2/verifications/verification-1'&&++$gets===1)throw new AmbiguousProvisioning('Details down');return null;});
 $result=Rentals::purchase($u,input(),id(),false,$p);eq($result['status'],'reconciliation');eq($p->findIntent($result['id'])['outcome'],'provisioned');eq($posts,1);
});
test('Idempotency conflict from provider is ambiguous and never refunds',function(){
 $u=customer();$p=adapter(fn($m,$path)=>$path==='/api/pub/v2/verifications'?['http'=>409,'data'=>['errorCode'=>'IdempotencyConflict'],'headers'=>[]]:null);
 $result=Rentals::purchase($u,input(),id(),false,$p);eq($result['status'],'reconciliation');eq(Wallet::balance($u['id'])['reserved_usd'],'3.20');
});
test('SMS parsedCode preserves leading zeroes and full body',function(){
 $p=adapter(fn($m,$path)=>$path==='/api/pub/v2/sms'?['http'=>200,'data'=>['data'=>[['id'=>'sms-1','to'=>'12025550123','parsedCode'=>'001234','smsContent'=>'Your code: 001234','encrypted'=>false]],'hasNext'=>false],'headers'=>[]]:null);
 $result=$p->status('verification-1');eq($result['sms_code'],'001234');eq($result['status'],'completed');eq($result['messages'][0]['body'],'Your code: 001234');eq($result['can_cancel'],false);
});
test('Completed label with no actual SMS code stays active',function(){
 $p=adapter(fn($m,$path)=>$path==='/api/pub/v2/verifications/verification-1'?['http'=>200,'data'=>details('VerificationCompleted'),'headers'=>[]]:null);
 eq($p->status('verification-1')['status'],'active');
});
test('Provider timeout and cancellation qualify for customer refunds without assuming supplier credit',function(){foreach(['VerificationTimedOut'=>'expired','verificationCanceled'=>'cancelled']as$state=>$expected){$p=adapter(fn($m,$path)=>$path==='/api/pub/v2/verifications/verification-1'?['http'=>200,'data'=>details($state),'headers'=>[]]:null);$result=$p->status('verification-1');eq($result['status'],$expected);eq(isset($result['no_sms_confirmed']),false);eq(isset($result['customer_refund_reason']),true);}});
test('Explicit refunded state plus empty reservation SMS supports exactly one full wallet refund',function(){
 $u=customer();$result=Rentals::purchase($u,input(),id(),false,adapter());
 $p=adapter(fn($m,$path)=>$path==='/api/pub/v2/verifications/verification-1'?['http'=>200,'data'=>details('VerificationRefunded'),'headers'=>[]]:null);
 $confirmed=$p->status('verification-1');eq($confirmed['no_sms_confirmed'],true);Rentals::settle($result['id'],$confirmed);Rentals::settle($result['id'],$confirmed);eq(Wallet::balance($u['id'])['balance_usd'],'10.00');
});
test('Foreign-number SMS cannot be shown or used to settle',function(){
 $p=adapter(fn($m,$path)=>$path==='/api/pub/v2/sms'?['http'=>200,'data'=>['data'=>[['id'=>'x','to'=>'19999999999','parsedCode'=>'1234']],'hasNext'=>false],'headers'=>[]]:null);
 rejects(fn()=>$p->status('verification-1'),'INVALID_PROVIDER_RESPONSE');
});
test('Provider outage never becomes a refund or empty SMS',function(){
 $p=adapter(fn($m,$path)=>$path==='/api/pub/v2/sms'?['http'=>503,'data'=>[],'headers'=>[]]:null);rejects(fn()=>$p->status('verification-1'),'PROVIDER_UNAVAILABLE');
});
test('Cancellation rechecks capabilities and does not claim success without final provider status',function(){
 $posts=0;$p=adapter(function($m,$path)use(&$posts){if(str_ends_with($path,'/cancel'))$posts++;return null;});$result=$p->cancel('verification-1');eq($posts,1);eq($result['status'],'active');
});
test('Cancellation is skipped when a code arrived first',function(){
 $posts=0;$p=adapter(function($m,$path)use(&$posts){if(str_ends_with($path,'/cancel'))$posts++;if($path==='/api/pub/v2/sms')return ['http'=>200,'data'=>['data'=>[['id'=>'x','to'=>'12025550123','parsedCode'=>'001234','encrypted'=>false]],'hasNext'=>false],'headers'=>[]];return null;});eq($p->cancel('verification-1')['status'],'completed');eq($posts,0);
});
test('Order ownership protects both status and code history',function(){ $u=customer();$result=Rentals::purchase($u,input(),id(),false,adapter());rejects(fn()=>Rentals::owned($result['id'],customer()['id']),'NOT_FOUND'); });
test('Number table pages ten newest active/completed non-expired visible rentals',function(){
 $u=customer();$other=customer();
 for($i=0;$i<15;$i++){
  $id=id();$status=$i%2===0?'active':'completed';
  query('INSERT INTO orders (id,user_id,provider,product,service,status,price_cents,price_tier,idempotency_key,request_hash,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$u['id'],'textverified','usa','service-'.$i,$status,100,'retail',id(),'test','2099-01-01 00:00:00',gmdate('Y-m-d H:i:s',time()-$i*60),now()]);
 }
 $rows=all('SELECT * FROM orders ORDER BY created_at DESC');
 query("UPDATE orders SET status='cancelled' WHERE id=?",[$rows[12]['id']]);
 query('UPDATE orders SET expires_at=? WHERE id=?',[now(),$rows[13]['id']]);
 query('UPDATE orders SET hidden_from_numbers=1 WHERE id=?',[$rows[14]['id']]);
 $first=Rentals::listing($u,'usa',true,1,100);$second=Rentals::listing($u,'usa',true,2,100);
 eq($first['total'],12);eq($first['per_page'],10);eq(count($first['items']),10);eq(count($second['items']),2);
 eq($first['items'][0]['service'],'service-0');eq($second['items'][0]['service'],'service-10');
 eq(Rentals::listing($other,'usa',true)['total'],0);eq(Rentals::listing($u,'usa',false)['total'],15);
});
test('Accepted cancellation removes the row and refunds the entire charge once',function(){
 $u=customer();$order=Rentals::purchase($u,input(),id(),false,adapter());
 $confirmed=adapter()->cancel('verification-1');eq($confirmed['cancel_requested'],true);
 Rentals::settle($order['id'],$confirmed);
 eq(Rentals::listing($u,'usa',true)['total'],0);eq(Rentals::listing($u,'usa',false)['total'],1);
 eq(Wallet::balance($u['id'])['balance_usd'],'10.00');
 Rentals::settle($order['id'],$confirmed);eq(Wallet::balance($u['id'])['balance_usd'],'10.00');
 eq((int)one('SELECT COUNT(*) n FROM ledger WHERE reference=?',['refund:'.$order['id']])['n'],1);
});
test('Full catalogue snapshot serves all saved prices without provider calls and applies current margin',function()use($config){
 query('DELETE FROM textverified_cache');
 $items=[['id'=>'google','service'=>'Google'],['id'=>'telegram','service'=>'Telegram'],['id'=>'unknown','service'=>'Unknown']];
 query('INSERT INTO textverified_cache (id,payload,expires_at) VALUES (?,?,?)',['services',json_encode(['items'=>$items]),'2000-01-01 00:00:00']);
 foreach(['google'=>250,'telegram'=>125]as$service=>$cost)query('INSERT INTO textverified_cache (id,payload,expires_at) VALUES (?,?,?)',['catalogue-price:'.hash('sha256',$service),json_encode(['service'=>$service,'cost_minor'=>$cost]),'2000-01-01 00:00:00']);
 $p=new TextVerifiedProvider(fn()=>throw new \RuntimeException('Browsing must not call the provider'));
 $result=$p->pricedCatalogue($config);eq(count($result['items']),3);eq($result['items'][0]['price_usd'],'3.20');eq($result['items'][1]['price_usd'],'1.95');eq($result['items'][2]['price_pending'],true);eq($result['prices_syncing'],true);
 $changed=$config;$changed['retail_margin_cents']=100;eq($p->pricedCatalogue($changed)['items'][0]['price_usd'],'3.50');
 eq(isset($result['items'][0]['cost_minor']),false);
 query('DELETE FROM textverified_cache');
});

test('Background price refresh stores display snapshot and preserves last price on outage',function()use($config){
 query('DELETE FROM textverified_cache');
 query('INSERT INTO textverified_cache (id,payload,expires_at) VALUES (?,?,?)',['services',json_encode(['items'=>[['id'=>'google','service'=>'Google']]]),'2099-01-01 00:00:00']);
 adapter()->warmCataloguePrice('google');
 eq(adapter()->pricedCatalogue($config)['items'][0]['price_usd'],'3.20');eq(adapter()->pricedCatalogue($config)['prices_syncing'],false);
 $p=adapter(fn($m,$path)=>str_contains($path,'pricing/verifications')?['http'=>503,'data'=>[],'headers'=>[]]:null);
 rejects(fn()=>$p->warmCataloguePrice('google'),'PROVIDER_UNAVAILABLE');
 eq(adapter()->pricedCatalogue($config)['items'][0]['price_usd'],'3.20');
 query('DELETE FROM textverified_cache');
});

test('Local timeout returns the captured retail charge once without provider availability',function(){
 $u=customer();$o=Rentals::purchase($u,input(),id(),false,adapter());query('UPDATE orders SET expires_at=? WHERE id=?',[gmdate('Y-m-d H:i:s',time()-1),$o['id']]);
 eq(Rentals::expireDue($u['id']),1);eq(Wallet::balance($u['id'])['balance_usd'],'10.00');eq(Rentals::owned($o['id'],$u['id'])['status'],'expired');eq(Rentals::expireDue($u['id']),0);eq(Rentals::sync(Rentals::owned($o['id'],$u['id']))['refund_usd'],'3.20');
});
test('Timeout refunds actual captured amount rather than a changed order price',function(){
 $u=customer();$o=Rentals::purchase($u,input(),id(),false,adapter());query('UPDATE orders SET expires_at=?,price_cents=999 WHERE id=?',[gmdate('Y-m-d H:i:s',time()-1),$o['id']]);Rentals::expireDue($u['id']);eq(Wallet::balance($u['id'])['balance_usd'],'10.00');eq((int)one('SELECT amount_cents FROM ledger WHERE reference=?',['refund:'.$o['id']])['amount_cents'],320);
});
test('Delivered codes and another customers account cannot be refunded by expiry sweep',function(){
 $u=customer();$other=customer();$o=Rentals::purchase($u,input(),id(),false,adapter());query('UPDATE orders SET expires_at=? WHERE id=?',[gmdate('Y-m-d H:i:s',time()-1),$o['id']]);eq(Rentals::expireDue($other['id']),0);eq(Wallet::balance($u['id'])['balance_usd'],'6.80');Rentals::settle($o['id'],['status'=>'completed','sms_code'=>'001234']);eq(Rentals::expireDue($u['id']),0);eq(Wallet::balance($u['id'])['balance_usd'],'6.80');
});
test('Provider timeout refunds once and a later supplier refund cannot duplicate it',function(){
 $u=customer();$o=Rentals::purchase($u,input(),id(),false,adapter());$p=adapter(fn($m,$path)=>$path==='/api/pub/v2/verifications/verification-1'?['http'=>200,'data'=>details('VerificationTimedOut'),'headers'=>[]]:null);Rentals::settle($o['id'],$p->status('verification-1'));Rentals::settle($o['id'],['status'=>'cancelled','authoritative'=>true,'no_sms_confirmed'=>true]);eq(Wallet::balance($u['id'])['balance_usd'],'10.00');eq((int)one('SELECT COUNT(*) n FROM ledger WHERE reference=?',['refund:'.$o['id']])['n'],1);
});
test('Rejected cancellation leaves the active number and charge unchanged',function(){
 $u=customer();$o=Rentals::purchase($u,input(),id(),false,adapter());$p=adapter(fn($m,$path)=>str_ends_with($path,'/cancel')?['http'=>400,'data'=>['errorCode'=>'CannotCancel'],'headers'=>[]]:null);rejects(fn()=>$p->cancel('verification-1'),'PROVIDER_UNAVAILABLE');eq(Wallet::balance($u['id'])['balance_usd'],'6.80');eq(Rentals::owned($o['id'],$u['id'])['status'],'active');
});
test('Background sync reflects TextVerified cancellation and refunds the number once without a cancel POST',function(){
 require_once __DIR__.'/../src/Commerce.php';require_once __DIR__.'/../src/NumberSync.php';$cancelled=false;$cancelPosts=0;
 $p=adapter(function($m,$path)use(&$cancelled,&$cancelPosts){if(str_ends_with($path,'/cancel'))$cancelPosts++;if($path==='/api/pub/v2/verifications/verification-1'&&$cancelled)return ['http'=>200,'data'=>details('verificationCanceled'),'headers'=>[]];return null;});
 $u=customer();$o=Rentals::purchase($u,input(),id(),false,$p);$cancelled=true;query("UPDATE orders SET updated_at='2000-01-01 00:00:00' WHERE id=?",[$o['id']]);eq(NumberSync::run($u['id'],$p)['synced'],1);eq(Rentals::owned($o['id'],$u['id'])['status'],'cancelled');eq(Wallet::balance($u['id'])['balance_usd'],'10.00');eq($cancelPosts,0);NumberSync::run($u['id'],$p);eq(Wallet::balance($u['id'])['balance_usd'],'10.00');
});
echo "$passed TextVerified tests passed\n";

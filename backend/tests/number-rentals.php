<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:');putenv('APP_ENV=testing');
require __DIR__.'/../src/bootstrap.php';
foreach(['Wallet','Pricing','Providers','Rentals','Commerce','SmmOrders','Reconciliation','NumberRentals']as$file)require_once __DIR__.'/../src/'.$file.'.php';
foreach(glob(__DIR__.'/../migrations/*.sql')as$file)db()->exec(file_get_contents($file));
$fixture=Pricing::setting('long-term_pricing');$fixture['retail_margin_cents']=100;$fixture['wholesale_margin_cents']=$fixture['retail_margin_cents'];query("UPDATE settings SET value=? WHERE name='long-term_pricing'",[json_encode($fixture)]);
$passed=0;
function eq(mixed $a,mixed $b):void{if($a!==$b)throw new \RuntimeException(var_export($a,true).' !== '.var_export($b,true));}
function rejects(callable $fn,string $key):void{try{$fn();}catch(Problem $e){eq($e->key,$key);return;}throw new \RuntimeException('Expected '.$key);}
function test(string $name,callable $fn):void{global $passed;foreach(['reward_costs','messages','smm_refills','smm_orders','number_rental_requests','fulfilment_intents','provider_receipts','number_provider_requests','orders','ledger','wallets','users','textverified_cache']as$table)query('DELETE FROM '.$table);$fn();$passed++;echo "PASS $name\n";}
function customer(int $balance=10000):array{$id=id();query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$id,'Rental QA',$id.'@example.invalid','unused',id(),now()]);query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,?)',[$id,$balance]);return ['id'=>$id];}
function requestInput():array{return ['service'=>'google','duration'=>'sevenDay','max_price_usd'=>'3.40'];}
function fake(?callable $override=null):array{
 $state=(object)['purchases'=>0,'extensions'=>0,'refunds'=>0,'ends'=>'2099-01-01T00:00:00Z','status'=>'nonrenewableActive','headers'=>[]];
 $connection=new TextVerifiedProvider(function($method,$url,$body,$headers)use($state,$override){
  $path=parse_url($url,PHP_URL_PATH);parse_str(parse_url($url,PHP_URL_QUERY)??'',$query);
  if($override){$result=$override($method,$path,$body,$query,$state);if($result!==null)return $result;}
  $data=[];$http=200;$responseHeaders=[];
  if($path==='/api/pub/v2/auth')$data=['token'=>'fixture-token','expiresAt'=>'2099-01-01T00:00:00Z'];
  elseif($path==='/api/pub/v2/services'){eq($query['reservationType'],'nonrenewable');$data=[['serviceName'=>'google','description'=>'Google','capability'=>'Sms'],['serviceName'=>'test_success','capability'=>'Sms'],['serviceName'=>'voice','capability'=>'Voice']];}
  elseif($path==='/api/pub/v2/inventory/rentals')$data=['availableQuantity'=>10];
  elseif($path==='/api/pub/v2/pricing/rentals'){$data=['serviceName'=>'google','price'=>2.40];eq($body['isRenewable'],false);eq($body['areaCode'],false);}
  elseif($path==='/api/pub/v2/reservations/rental'){$state->purchases++;$state->headers=$headers;eq($body['allowBackOrderReservations'],false);eq($body['isRenewable'],false);$http=201;$data=['href'=>'https://backend.textverified.com/api/pub/v2/sales/sale-1'];}
  elseif($path==='/api/pub/v2/sales/sale-1')$data=['id'=>'sale-1','state'=>'succeeded','total'=>2.40,'backOrderReservations'=>[],'reservations'=>[['id'=>'rental-1','serviceName'=>'google','reservationType'=>'nonrenewable','link'=>['href'=>'https://backend.textverified.com/api/pub/v2/reservations/rental/nonrenewable/rental-1']]]];
  elseif($path==='/api/pub/v2/reservations/rental/nonrenewable/rental-1')$data=['id'=>'rental-1','serviceName'=>'google','number'=>'12025550123','endsAt'=>$state->ends,'state'=>$state->status,'refund'=>['canRefund'=>$state->status==='nonrenewableActive']];
  elseif($path==='/api/pub/v2/reservations/rentals/extensions'){$state->extensions++;$original=$state->ends;$state->ends=gmdate('Y-m-d\TH:i:s\Z',strtotime($state->ends)+604800);$data=['reservationId'=>'rental-1','originalEndsAt'=>$original,'newEndsAt'=>$state->ends,'cost'=>2.40];}
  elseif($path==='/api/pub/v2/reservations/rental/nonrenewable/rental-1/refund'){$state->refunds++;$state->status='nonrenewableRefunded';}
  elseif($path==='/api/pub/v2/sms'){eq($query['reservationId'],'rental-1');eq($query['reservationType'],'nonrenewable');$data=['data'=>[['id'=>'sms-1','to'=>'12025550123','from'=>'Google','parsedCode'=>'001234','smsContent'=>'Your code is 001234','createdAt'=>'2026-10-19T12:00:00Z','encrypted'=>false]],'hasNext'=>false];}
  else throw new \RuntimeException('Unexpected endpoint '.$method.' '.$path);
  return ['http'=>$http,'data'=>$data,'headers'=>$responseHeaders];
 });
 return [new TextVerifiedRentalProvider($connection),$state];
}
function buy(array $u,TextVerifiedRentalProvider $provider):array{return Commerce::fulfil($u,'long-term','purchase',requestInput(),id(),$provider);}

test('Configurable rental test pricing uses a one dollar fixture margin',function(){eq(Commerce::price('long-term',['currency'=>'USD','cost_minor'=>240]),340);});
test('Catalogue uses nonrenewable SMS services and exposes seven supported durations',function(){[$p]=fake();$r=$p->catalogue('long-term');eq($r['items'],[['id'=>'google','name'=>'Google']]);eq(count($r['durations']),7);});
test('Invalid options and out-of-stock rentals stop before any wallet reservation',function(){[$p]=fake(fn($m,$path)=>str_contains($path,'inventory/rentals')?['http'=>200,'data'=>['availableQuantity'=>0],'headers'=>[]]:null);$u=customer();rejects(fn()=>$p->quote('long-term',['service'=>'google','duration'=>'invalid'],null),'INVALID_DURATION');rejects(fn()=>buy($u,$p),'OUT_OF_STOCK');eq(Wallet::balance($u['id'])['balance_usd'],'100.00');});
test('Purchase follows sale and rental links captures USD once and preserves stable vendor key',function(){[$p,$s]=fake();$u=customer();$key=id();$a=Commerce::fulfil($u,'long-term','purchase',requestInput(),$key,$p);$b=Commerce::fulfil($u,'long-term','purchase',requestInput(),$key,$p);eq($a['status'],'completed');eq($a['resource_id'],$b['resource_id']);eq($s->purchases,1);eq(Wallet::balance($u['id'])['balance_usd'],'96.60');$row=Commerce::owned('long-term',$a['resource_id'],$u['id']);eq($row['provider'],'textverified');eq($row['rental_duration'],'sevenDay');eq((int)$row['auto_renew'],0);eq(in_array('Idempotency-Key: boostlier-'.$a['id'],$s->headers,true),true);});
test('Insufficient balance and price caps prevent a provider purchase',function(){[$p,$s]=fake();$u=customer(339);rejects(fn()=>buy($u,$p),'INSUFFICIENT_FUNDS');$u=customer();rejects(fn()=>Commerce::fulfil($u,'long-term','purchase',array_replace(requestInput(),['max_price_usd'=>'3.39']),id(),$p),'PRICE_EXCEEDS_MAX');eq($s->purchases,0);});
test('Definitive provider purchase rejection releases the wallet reservation once',function(){[$p]=fake(fn($m,$path)=>$path==='/api/pub/v2/reservations/rental'?['http'=>400,'data'=>['errorCode'=>'OutOfStock'],'headers'=>[]]:null);$u=customer();$key=id();$a=Commerce::fulfil($u,'long-term','purchase',requestInput(),$key,$p);Commerce::fulfil($u,'long-term','purchase',requestInput(),$key,$p);eq($a['status'],'rejected');eq(Wallet::balance($u['id'])['balance_usd'],'100.00');eq(Wallet::balance($u['id'])['reserved_usd'],'0.00');});
test('Acknowledged purchase recovers its saved sale without a second purchase POST',function(){$fail=true;[$p,$s]=fake(function($m,$path)use(&$fail){if($path==='/api/pub/v2/sales/sale-1'&&$fail){$fail=false;throw new AmbiguousProvisioning('Temporary read failure');}return null;});$u=customer();$a=buy($u,$p);eq($a['status'],'reconciliation');$outcome=$p->findIntent($a['id']);Commerce::activate($a['id'],$outcome['receipt'],requestInput());eq($s->purchases,1);eq(Wallet::balance($u['id'])['balance_usd'],'96.60');});
test('Extensions keep the same number and charge only once for the client retry key',function(){[$p,$s]=fake();$u=customer();$a=buy($u,$p);$input=['id'=>$a['resource_id'],'duration'=>'sevenDay','max_price_usd'=>'3.40'];$key=id();$first=Commerce::fulfil($u,'long-term','renewal',$input,$key,$p);$second=Commerce::fulfil($u,'long-term','renewal',$input,$key,$p);eq($first['id'],$second['id']);eq($s->extensions,1);eq(Wallet::balance($u['id'])['balance_usd'],'93.20');eq(Commerce::owned('long-term',$a['resource_id'],$u['id'])['expires_at'],'2099-01-08 00:00:00');});
test('Uncertain extensions are not replayed and block another extension while pending',function(){[$p,$s]=fake(function($m,$path,$body,$query,$state){if($path==='/api/pub/v2/reservations/rentals/extensions'){$state->extensions++;throw new AmbiguousProvisioning('Unknown extension response');}return null;});$u=customer();$a=buy($u,$p);$input=['id'=>$a['resource_id'],'duration'=>'sevenDay','max_price_usd'=>'3.40'];$r=Commerce::fulfil($u,'long-term','renewal',$input,id(),$p);eq($r['status'],'reconciliation');rejects(fn()=>$p->findIntent($r['id']),'RECONCILIATION_REQUIRED');rejects(fn()=>Commerce::fulfil($u,'long-term','renewal',$input,id(),$p),'RENEWAL_PENDING');eq($s->extensions,1);eq(Wallet::balance($u['id'])['reserved_usd'],'3.40');});
test('A timed-out extension can reconcile from the matching provider expiry without redispatch',function(){[$p,$s]=fake(function($m,$path,$body,$query,$state){if($path==='/api/pub/v2/reservations/rentals/extensions'){$state->extensions++;$state->ends='2099-01-08T00:00:00Z';throw new AmbiguousProvisioning('Response lost after extension');}return null;});$u=customer();$a=buy($u,$p);$input=['id'=>$a['resource_id'],'duration'=>'sevenDay','max_price_usd'=>'3.40'];$r=Commerce::fulfil($u,'long-term','renewal',$input,id(),$p);$outcome=$p->findIntent($r['id']);Commerce::activate($r['id'],$outcome['receipt'],$input);eq($s->extensions,1);eq(Wallet::balance($u['id'])['balance_usd'],'93.20');});
test('Rental ownership and expiry prevent access or extensions across accounts',function(){[$p]=fake();$u=customer();$a=buy($u,$p);rejects(fn()=>NumberRentals::owned(customer(),$a['resource_id']),'NOT_FOUND');query("UPDATE orders SET expires_at='2000-01-01 00:00:00' WHERE id=?",[$a['resource_id']]);rejects(fn()=>NumberRentals::inbox($u,$a['resource_id']),'RENTAL_EXPIRED');rejects(fn()=>$p->quote('long-term',['duration'=>'sevenDay'],Commerce::owned('long-term',$a['resource_id'],$u['id'])),'RENTAL_EXPIRED');});
test('SMS inbox preserves leading zeroes and validates reservation and recipient',function(){[$p]=fake();eq($p->messages('rental-1')[0]['code'],'001234');[$p]=fake(fn($m,$path)=>$path==='/api/pub/v2/sms'?['http'=>200,'data'=>['data'=>[['id'=>'foreign','to'=>'19999999999']],'hasNext'=>false],'headers'=>[]]:null);rejects(fn()=>$p->messages('rental-1'),'INVALID_PROVIDER_RESPONSE');});
test('Empty inbox and provider error stay distinct and foreign message IDs are denied',function(){[$p]=fake(fn($m,$path)=>$path==='/api/pub/v2/sms'?['http'=>200,'data'=>['data'=>[],'hasNext'=>false],'headers'=>[]]:null);eq($p->messages('rental-1'),[]);rejects(fn()=>$p->message('rental-1','foreign'),'NOT_FOUND');[$p]=fake(fn($m,$path)=>$path==='/api/pub/v2/sms'?['http'=>503,'data'=>[],'headers'=>[]]:null);rejects(fn()=>$p->messages('rental-1'),'PROVIDER_UNAVAILABLE');});
test('Foreign sale links and inbox pagination links are rejected',function(){[$p]=fake(fn($m,$path)=>$path==='/api/pub/v2/reservations/rental'?['http'=>201,'data'=>['href'=>'https://evil.example/api/pub/v2/sales/x'],'headers'=>[]]:null);$u=customer();eq(buy($u,$p)['status'],'reconciliation');[$p]=fake(fn($m,$path)=>$path==='/api/pub/v2/sms'?['http'=>200,'data'=>['data'=>[],'hasNext'=>true,'links'=>['next'=>['href'=>'https://backend.textverified.com/api/pub/v2/sms?reservationId=another&reservationType=nonrenewable']]],'headers'=>[]]:null);rejects(fn()=>$p->messages('rental-1'),'INVALID_PROVIDER_RESPONSE');});
test('Provider-supported rental cancellation reports only the original charge as refundable',function(){[$p,$s]=fake();$u=customer();$a=buy($u,$p);$r=$p->action('rental-1','cancel');eq($r['status'],'cancelled');eq($r['refund_cents'],340);eq($s->refunds,1);$p->action('rental-1','cancel');eq($s->refunds,1);});
test('Rental expiry does not apply the single-use verification refund policy',function(){[$p]=fake();$u=customer();$a=buy($u,$p);query("UPDATE orders SET expires_at='2000-01-01 00:00:00' WHERE id=?",[$a['resource_id']]);eq(Rentals::expireDue($u['id']),0);eq(Wallet::balance($u['id'])['balance_usd'],'96.60');$r=NumberRentals::listing($u);eq($r['items'][0]['status'],'expired');});
test('A mismatched sale identifier never activates or captures a rental',function(){
 [$p]=fake(fn($m,$path)=>$path==='/api/pub/v2/sales/sale-1'?['http'=>200,'data'=>['id'=>'different-sale','state'=>'succeeded'],'headers'=>[]]:null);
 $u=customer();$r=buy($u,$p);eq($r['status'],'reconciliation');eq(Wallet::balance($u['id'])['balance_usd'],'96.60');eq(Wallet::balance($u['id'])['reserved_usd'],'3.40');eq((int)one("SELECT COUNT(*) n FROM ledger WHERE user_id=? AND kind='purchase'",[$u['id']])['n'],0);
});
test('Extension recovery cannot reactivate a refunded provider rental',function(){
 [$p,$s]=fake(function($m,$path,$body,$query,$state){if($path==='/api/pub/v2/reservations/rentals/extensions'){$state->extensions++;$state->ends='2099-01-08T00:00:00Z';$state->status='nonrenewableRefunded';throw new AmbiguousProvisioning('Response lost');}return null;});
 $u=customer();$a=buy($u,$p);$r=Commerce::fulfil($u,'long-term','renewal',['id'=>$a['resource_id'],'duration'=>'sevenDay','max_price_usd'=>'3.40'],id(),$p);
 rejects(fn()=>$p->findIntent($r['id']),'RECONCILIATION_REQUIRED');eq($s->extensions,1);eq(Wallet::balance($u['id'])['reserved_usd'],'3.40');
});
test('Live provider generic reservation links activate immediately without another purchase',function(){
 [$p,$s]=fake(function($method,$path,$body,$query){
  if($path==='/api/pub/v2/sales/sale-1')return ['http'=>200,'headers'=>[],'data'=>['id'=>'sale-1','state'=>'succeeded','total'=>2.40,'backOrderReservations'=>[],'reservations'=>[['id'=>'rental-1','serviceName'=>'google','reservationType'=>'nonrenewable','link'=>['href'=>'https://www.textverified.com/api/pub/v2/reservations/rental-1?type=Nonrenewable']]]]];
  if($path==='/api/pub/v2/reservations/rental-1')throw new \RuntimeException('Generic link must resolve through canonical detail endpoint');
  return null;
 });$u=customer();$r=buy($u,$p);eq($r['status'],'completed');eq($s->purchases,1);eq(Wallet::balance($u['id'])['reserved_usd'],'0.00');
});
test('Generic reservation links cannot switch the rental ID or reservation type',function(){
 foreach(['rental-1?type=Renewable','different?type=Nonrenewable','rental-1?type=Nonrenewable&other=1']as$suffix){
  [$p]=fake(fn($m,$path)=>$path==='/api/pub/v2/sales/sale-1'?['http'=>200,'headers'=>[],'data'=>['id'=>'sale-1','state'=>'succeeded','total'=>2.40,'backOrderReservations'=>[],'reservations'=>[['id'=>'rental-1','serviceName'=>'google','reservationType'=>'nonrenewable','link'=>['href'=>'https://www.textverified.com/api/pub/v2/reservations/'.$suffix]]]]]:null);
  eq(buy(customer(),$p)['status'],'reconciliation');
 }
});
test('Provider display names match their catalogue IDs without accepting another service',function(){
 foreach(['Google Account','Different Service']as$name){
  [$p]=fake(function($m,$path)use($name){
   if($path==='/api/pub/v2/services')return ['http'=>200,'headers'=>[],'data'=>[['serviceName'=>'google','description'=>'Google Account','capability'=>'Sms']]];
   if($path==='/api/pub/v2/sales/sale-1')return ['http'=>200,'headers'=>[],'data'=>['id'=>'sale-1','state'=>'succeeded','total'=>2.40,'backOrderReservations'=>[],'reservations'=>[['id'=>'rental-1','serviceName'=>$name,'reservationType'=>'nonrenewable','link'=>['href'=>'https://www.textverified.com/api/pub/v2/reservations/rental-1?type=Nonrenewable']]]]];
   if($path==='/api/pub/v2/reservations/rental/nonrenewable/rental-1')return ['http'=>200,'headers'=>[],'data'=>['id'=>'rental-1','serviceName'=>$name,'number'=>'12025550123','endsAt'=>'2099-01-01T00:00:00Z','state'=>'nonrenewableActive','refund'=>['canRefund'=>true]]];return null;
  });query("DELETE FROM textverified_cache WHERE id='rental-services'");eq(buy(customer(),$p)['status'],$name==='Google Account'?'completed':'reconciliation');
 }
});
test('An already refunded acknowledged purchase releases its wallet hold once on recovery',function(){
 $fail=true;[$p,$s]=fake(function($m,$path)use(&$fail){if($path==='/api/pub/v2/sales/sale-1'&&$fail){$fail=false;throw new AmbiguousProvisioning('Read interrupted');}return null;});$u=customer();$r=buy($u,$p);$s->status='nonrenewableRefunded';eq($p->findIntent($r['id'])['outcome'],'not_provisioned');Reconciliation::run($r['id']);Reconciliation::run($r['id']);eq(Wallet::balance($u['id'])['reserved_usd'],'0.00');eq(Wallet::balance($u['id'])['balance_usd'],'100.00');eq($s->purchases,1);
});
test('Provider-side rental cancellation synchronises and refunds once with customer isolation',function(){
 require_once __DIR__.'/../src/NumberSync.php';[$p,$s]=fake();$u=customer();$a=buy($u,$p);$other=customer();$s->status='nonrenewableRefunded';query("UPDATE orders SET updated_at='2000-01-01 00:00:00' WHERE id=?",[$a['resource_id']]);
 eq(NumberSync::run($other['id'],null,$p)['synced'],0);eq(NumberSync::run($u['id'],null,$p)['synced'],1);eq(NumberSync::run($u['id'],null,$p)['synced'],0);
 eq(Commerce::owned('long-term',$a['resource_id'],$u['id'])['status'],'cancelled');eq(Wallet::balance($u['id'])['balance_usd'],'100.00');eq($s->refunds,0);eq($s->purchases,1);
});
test('Sync outages preserve rental state and funds and polling is throttled',function(){
 require_once __DIR__.'/../src/NumberSync.php';$down=false;[$p]=fake(function($m,$path)use(&$down){if($down&&$path==='/api/pub/v2/reservations/rental/nonrenewable/rental-1')throw new AmbiguousProvisioning('Provider unavailable');return null;});$u=customer();$a=buy($u,$p);$down=true;query("UPDATE orders SET updated_at='2000-01-01 00:00:00' WHERE id=?",[$a['resource_id']]);eq(NumberSync::run($u['id'],null,$p)['deferred'],1);eq(NumberSync::run($u['id'],null,$p)['deferred'],0);eq(Commerce::owned('long-term',$a['resource_id'],$u['id'])['status'],'active');eq(Wallet::balance($u['id'])['balance_usd'],'96.60');
});
test('Rentals listing always pages ten newest records',function(){
 $u=customer();for($i=0;$i<12;$i++){query('INSERT INTO orders (id,user_id,provider,provider_order_id,product,service,phone,status,price_cents,price_tier,idempotency_key,request_hash,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[str_pad((string)$i,32,'0',STR_PAD_LEFT),$u['id'],'textverified','fixture-'.$i,'long-term','google','12025550123','active',340,'retail',id(),'hash','2099-01-01 00:00:00',sprintf('2026-01-%02d 00:00:00',$i+1),now()]);}
 $_GET=['page'=>1,'per_page'=>100];$list=NumberRentals::listing($u);eq(count($list['items']),10);eq($list['items'][0]['id'],str_pad('11',32,'0',STR_PAD_LEFT));$_GET=['page'=>2];eq(count(NumberRentals::listing($u)['items']),2);$_GET=[];
});
test('Combined history exposes Number versus Long-term Rental and keeps customers isolated',function(){
 [$p]=fake();$u=customer();$rental=buy($u,$p);$other=customer();buy($other,$p);
 $number=id();query('INSERT INTO orders (id,user_id,provider,product,service,phone,status,price_cents,price_tier,idempotency_key,request_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[$number,$u['id'],'textverified','usa','google','12025550124','completed',320,'retail',id(),'hash',now(),now()]);
 $history=Rentals::listing($u,null,false,1,10);eq($history['total'],2);$types=array_column($history['items'],'product');sort($types);eq($types,['long-term','usa']);
 foreach($history['items']as$row)if($row['product']==='long-term'){eq($row['id'],$rental['resource_id']);eq($row['can_cancel'],true);}
});
echo "$passed number rental tests passed\n";

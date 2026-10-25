<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:');putenv('APP_ENV=testing');
require __DIR__.'/../src/bootstrap.php';
foreach(['Wallet','Pricing','Providers','Commerce','SmmOrders'] as $file)require_once __DIR__.'/../src/'.$file.'.php';
foreach(glob(__DIR__.'/../migrations/*.sql') as $file)db()->exec(file_get_contents($file));
$config=['currency'=>'NGN','fx_numerator'=>1,'fx_denominator'=>2500,'fx_updated_at'=>now(),'fx_mode'=>'fixed','markup_basis_points'=>10000];
query("DELETE FROM settings WHERE name='smm_pricing'");
query('INSERT INTO settings (name,value,updated_at) VALUES (?,?,?)',['smm_pricing',json_encode($config),now()]);
$passed=0;
function eq(mixed $a,mixed $b):void{if($a!==$b)throw new \RuntimeException(var_export($a,true).' !== '.var_export($b,true));}
function test(string $name,callable $fn):void{global $passed;$fn();$passed++;echo "PASS $name\n";}
function rejects(callable $fn,string $code):void{try{$fn();}catch(Problem $error){eq($error->key,$code);return;}throw new \RuntimeException('Expected '.$code);}
function customer():array{$id=id();query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$id,'SMM test',$id.'@example.invalid','unused',id(),now()]);query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,2000)',[$id]);return one('SELECT * FROM users WHERE id=?',[$id]);}
function service(string $type='Default',bool $refill=true):array{return ['service'=>101,'name'=>'Instagram Followers','type'=>$type,'category'=>'Instagram','rate'=>'2500.00','min'=>'100','max'=>'10000','refill'=>$refill,'cancel'=>true];}
function payload():array{return ['service'=>'101','target'=>'https://example.com/public-post','quantity'=>1000,'max_price_usd'=>'2.00'];}
test('NGN per-1000 rate scales to kobo exactly',fn()=>eq(SmmProvider::costMinor('2500.00',1000),250000));
test('Fractional vendor rates round kobo upwards',fn()=>eq(SmmProvider::costMinor('0.000001',1),1));
test('Approved FX and 100 percent markup produce USD 2.00',fn()=>eq(Pricing::quote(250000,$config,'retail',true),200));
test('Markup is applied before final USD rounding',fn()=>eq(Pricing::quote(1,$config,'retail',true),1));
test('Fixed owner-approved FX does not become an invented market feed',function()use($config){$config['fx_updated_at']='2020-01-01';eq(Pricing::quote(250000,$config,'retail',true),200);});
test('Catalogue hides rates and never offers cancellation',function(){$p=new SmmProvider(fn()=>[service(),service('Custom Comments')]);$r=$p->catalogue('smm');eq(isset($r['items'][0]['rate']),false);eq($r['items'][0]['cancel'],false);eq($r['items'][1]['supported'],false);});
test('Blocked words are case insensitive across service names, categories and descriptions',function(){
 foreach(['Nigeria','NIGERIAN','nigerians','oWlEt'] as $word) foreach(['name','category','description'] as $field){
  $blocked=service();$blocked[$field]='Premium ['.$word.'] promotion';
  $p=new SmmProvider(fn()=>[$blocked]);
  eq($p->catalogue('smm')['items'],[]);
  rejects(fn()=>$p->quote('smm',payload(),null),'SERVICE_UNAVAILABLE');
 }
});

test('Filtering retains other services and matches whole words only',function(){
 $allowed=service();$allowed['description']='Owleton and Nigerianlike are different words';
 $blocked=service();$blocked['service']=102;$blocked['category']='Nigeria - Instagram';
 $p=new SmmProvider(fn()=>[$blocked,$allowed]);$items=$p->catalogue('smm')['items'];
 eq(array_keys($items),[0]);eq($items[0]['id'],'101');
 eq($p->quote('smm',payload(),null)['service'],'101');
});

test('Unsupported service types are rejected before submission',function(){$p=new SmmProvider(fn()=>[service('Subscriptions')]);rejects(fn()=>$p->quote('smm',payload(),null),'UNSUPPORTED_SERVICE_TYPE');});
test('Provider min and max are validated server-side',function(){$p=new SmmProvider(fn()=>[service()]);rejects(fn()=>$p->quote('smm',['service'=>'101','quantity'=>99],null),'INVALID_QUANTITY');rejects(fn()=>$p->quote('smm',['service'=>'101','quantity'=>10001],null),'INVALID_QUANTITY');});
test('Private and credential-bearing targets are rejected',function(){foreach(['http://localhost/post','http://127.0.0.1/post','https://user:password@example.com/post','javascript:alert(1)']as$url)rejects(fn()=>SmmProvider::validateTarget($url),'INVALID_TARGET');});
test('Accepted submission captures the server price only once',function(){ $u=customer();$adds=0;$p=new SmmProvider(function($action,$parameters)use(&$adds){if($action==='services')return[service()];if($action==='add'){$adds++;eq($parameters['service'],'101');eq($parameters['quantity'],1000);return['order'=>23501];}throw new \RuntimeException('Unexpected action');});$input=payload()+['price_usd'=>'0.01'];$key=id();$a=Commerce::fulfil($u,'smm','purchase',$input,$key,$p);$b=Commerce::fulfil($u,'smm','purchase',$input,$key,$p);eq($a['resource_id'],$b['resource_id']);eq($adds,1);eq($a['price_usd'],'2.00');eq(Wallet::balance($u['id'])['balance_usd'],'18.00');$row=Commerce::owned('smm',$a['resource_id'],$u['id']);eq((int)$row['refill_supported'],1);eq($row['service_name'],'Instagram Followers');});
test('Known provider rejection releases the reservation once',function(){ $u=customer();$adds=0;$p=new SmmProvider(function($action)use(&$adds){if($action==='services')return[service()];$adds++;return['error'=>'Do not echo private provider details'];});$key=id();$a=Commerce::fulfil($u,'smm','purchase',payload(),$key,$p);Commerce::fulfil($u,'smm','purchase',payload(),$key,$p);eq($a['status'],'rejected');eq($adds,1);eq(Wallet::balance($u['id'])['balance_usd'],'20.00');eq(Wallet::balance($u['id'])['reserved_usd'],'0.00');eq((int)one('SELECT COUNT(*) n FROM smm_orders WHERE user_id=?',[$u['id']])['n'],0);});
test('Ambiguous submission is held and never blindly retried',function(){ $u=customer();$adds=0;$p=new SmmProvider(function($action)use(&$adds){if($action==='services')return[service()];$adds++;throw new AmbiguousProvisioning('Simulated timeout');});$key=id();$a=Commerce::fulfil($u,'smm','purchase',payload(),$key,$p);$b=Commerce::fulfil($u,'smm','purchase',payload(),$key,$p);eq($a['status'],'reconciliation');eq($a['id'],$b['id']);eq($adds,1);eq(Wallet::balance($u['id'])['reserved_usd'],'2.00');eq(Wallet::balance($u['id'])['balance_usd'],'18.00');eq(json_decode(one('SELECT request_payload FROM fulfilment_intents WHERE id=?',[$a['id']])['request_payload'],true)['service'],'101');});
test('Idempotency conflict cannot submit different quantities',function(){ $u=customer();$p=new SmmProvider(fn($action)=>$action==='services'?[service()]:['order'=>23502]);$key=id();Commerce::fulfil($u,'smm','purchase',payload(),$key,$p);$changed=payload();$changed['quantity']=2000;rejects(fn()=>Commerce::fulfil($u,'smm','purchase',$changed,$key,$p),'IDEMPOTENCY_CONFLICT');});
test('A maximum price stops purchase before provider add',function(){ $u=customer();$adds=0;$p=new SmmProvider(function($action)use(&$adds){if($action==='services')return[service()];$adds++;return['order'=>1];});$input=payload();$input['max_price_usd']='0.01';rejects(fn()=>Commerce::fulfil($u,'smm','purchase',$input,id(),$p),'PRICE_EXCEEDS_MAX');eq($adds,0);eq(Wallet::balance($u['id'])['balance_usd'],'20.00');});
test('Unknown provider status stays under reconciliation',fn()=>eq(SmmProvider::normaliseStatus(['status'=>'Unexpected','currency'=>'NGN'])['status'],'reconciliation'));
test('A non-NGN provider status cannot settle an order',fn()=>rejects(fn()=>SmmProvider::normaliseStatus(['status'=>'Completed','currency'=>'USD']),'INVALID_PROVIDER_CURRENCY'));
test('Cancellation is rejected without a provider request',function(){ $calls=0;$p=new SmmProvider(function()use(&$calls){$calls++;return[];});rejects(fn()=>$p->action('1','cancel'),'CANCELLATION_UNAVAILABLE');eq($calls,0);});
test('Partial progress is recorded without inventing a refund',function(){ $u=customer();$p=new SmmProvider(fn($action)=>$action==='services'?[service()]:['order'=>23503]);$created=Commerce::fulfil($u,'smm','purchase',payload(),id(),$p);$row=Commerce::owned('smm',$created['resource_id'],$u['id']);$p=new SmmProvider(fn()=>['status'=>'Partial','currency'=>'NGN','charge'=>'1250.00','start_count'=>'3572','remains'=>'157']);$before=Wallet::balance($u['id']);$r=SmmOrders::refresh($row,$p,true);eq($r['status'],'partial');eq($r['start_count'],3572);eq($r['remaining'],157);eq($r['refund_review_required'],true);eq(Wallet::balance($u['id']),$before);});
test('Concurrent-style refill replays send one refill and never debit',function(){ $u=customer();$p=new SmmProvider(fn($action)=>$action==='services'?[service()]:['order'=>23504]);$created=Commerce::fulfil($u,'smm','purchase',payload(),id(),$p);$refills=0;$p=new SmmProvider(function($action)use(&$refills){if($action==='refill'){$refills++;return['refill'=>'81'];}return['status'=>'Pending'];});$before=Wallet::balance($u['id']);$a=SmmOrders::refill($u,$created['resource_id'],$p);$b=SmmOrders::refill($u,$created['resource_id'],$p);eq($a['id'],$b['id']);eq($refills,1);eq(Wallet::balance($u['id']),$before);$other=customer();rejects(fn()=>SmmOrders::refillStatus($other,$a['id'],$p),'NOT_FOUND');});
test('Refill uncertainty is not retried',function(){ $u=customer();$p=new SmmProvider(fn($action)=>$action==='services'?[service()]:['order'=>23505]);$created=Commerce::fulfil($u,'smm','purchase',payload(),id(),$p);$refills=0;$p=new SmmProvider(function()use(&$refills){$refills++;throw new AmbiguousProvisioning('Refill timeout');});$a=SmmOrders::refill($u,$created['resource_id'],$p);$b=SmmOrders::refill($u,$created['resource_id'],$p);eq($a['status'],'reconciliation');eq($a['id'],$b['id']);eq($refills,1);});
echo "$passed SMM tests passed\n";

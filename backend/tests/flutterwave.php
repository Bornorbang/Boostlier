<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:');putenv('APP_ENV=testing');putenv('FLW_SECRET_KEY=');putenv('FLW_SECRET_HASH=');putenv('BACKEND_PROXY_SECRET=proxy-test');
require __DIR__.'/../src/bootstrap.php';require __DIR__.'/../src/Wallet.php';require __DIR__.'/../src/Payments.php';
foreach(glob(__DIR__.'/../migrations/*.sql')as$f)db()->exec(file_get_contents($f));
$uid=id();query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$uid,'Test','funding@example.invalid','unused',id(),now()]);query('INSERT INTO wallets (user_id) VALUES (?)',[$uid]);$u=one('SELECT * FROM users WHERE id=?',[$uid]);$passed=0;
function test(string$n,callable$f):void{global$passed;$f();$passed++;echo "PASS $n\n";}
function eq(mixed$a,mixed$b):void{if($a!==$b)throw new \RuntimeException(var_export($a,true).' !== '.var_export($b,true));}
function rejects(callable$f,string$code):void{try{$f();}catch(Problem$e){eq($e->key,$code);return;}throw new \RuntimeException('Expected '.$code);}
test('Unconfigured funding cannot start a checkout',fn()=>rejects(fn()=>Flutterwave::checkout($u,[]),'PAYMENT_UNAVAILABLE'));
test('Forged country header without private proxy secret is ignored',function(){$_SERVER['HTTP_X_BOOSTLIER_COUNTRY']='NG';eq(Flutterwave::options()['country'],'OTHER');});
test('Trusted hosting country selects local region',function(){$_SERVER['HTTP_X_BOOSTLIER_PROXY_SECRET']='proxy-test';eq(Flutterwave::options()['country'],'NG');$_SERVER['HTTP_X_BOOSTLIER_COUNTRY']='DE';eq(Flutterwave::options()['country'],'EU');});
test('Minor-unit conversion rounds quotes upward',function(){eq(Flutterwave::minor('1234.567','NGN'),123457);eq(Flutterwave::minor('100.1','UGX'),101);eq(Flutterwave::decimal(100,'RWF'),'100');});
test('Verification does not round up underpayments',function(){eq(Flutterwave::minor('99.999','USD',false),9999);});
test('Invalid amount data rejected',function(){foreach([[],true,'-1','NaN','1e8']as$v)rejects(fn()=>Flutterwave::minor($v,'USD'),'PAYMENT_MISMATCH');});
putenv('FLW_SECRET_KEY=test');putenv('FLW_SECRET_HASH=webhook-test');
test('USD quote uses exact wallet amount without FX',function()use($u){$q=Flutterwave::quote($u,['amount_usd'=>'10.00','country'=>'US']);eq($q['checkout_amount'],'10.00');eq($q['checkout_currency'],'USD');eq($q['payment_options'],'card');});
test('Amount and unsupported country validated',function()use($u){rejects(fn()=>Flutterwave::quote($u,['amount_usd'=>'0.50','country'=>'US']),'INVALID_AMOUNT');rejects(fn()=>Flutterwave::quote($u,['amount_usd'=>'10.00','country'=>'ZZ']),'INVALID_COUNTRY');});
$id=id();query('INSERT INTO payments (id,user_id,provider,provider_reference,amount_cents,currency,status,created_at,updated_at,checkout_currency,checkout_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$id,$uid,'flutterwave','boostlier_'.$id,1000,'USD','pending',now(),now(),'NGN',1500000]);$s=['id'=>1234,'tx_ref'=>'boostlier_'.$id,'amount'=>'15000.00','currency'=>'NGN','status'=>'successful'];
test('Currency, reference, underpayment and missing transaction ID rejected',function()use($id,$s){foreach([['currency'=>'USD'],['tx_ref'=>'wrong'],['amount'=>'14999.999'],['id'=>null]]as$change)rejects(fn()=>Flutterwave::credit($id,array_replace($s,$change)),'PAYMENT_MISMATCH');});
test('Pending transaction gives no credit',function()use($id,$s,$uid){eq(Flutterwave::credit($id,array_replace($s,['status'=>'pending']))['status'],'pending');eq(Wallet::balance($uid)['balance_usd'],'0.00');});
test('Provider-confirmed failure gives no credit but can recover on later success',function()use($id,$s,$uid){eq(Flutterwave::credit($id,array_replace($s,['status'=>'failed']))['status'],'failed');eq(Wallet::balance($uid)['balance_usd'],'0.00');});
test('Verified local payment credits original USD amount exactly once',function()use($id,$s,$uid){eq(Flutterwave::credit($id,$s)['status'],'successful');Flutterwave::credit($id,$s);eq(Wallet::balance($uid)['balance_usd'],'10.00');eq((int)one("SELECT COUNT(*) n FROM ledger WHERE kind='topup'")['n'],1);});
test('Forged and missing webhook signatures rejected',function(){rejects(fn()=>Flutterwave::webhook('{}','wrong'),'INVALID_SIGNATURE');rejects(fn()=>Flutterwave::webhook('{}',''),'INVALID_SIGNATURE');});
test('Signed unrelated event is harmless',fn()=>eq(Flutterwave::webhook('{"event":"transfer.completed"}','webhook-test')['received'],true));
echo "$passed Flutterwave tests passed\n";

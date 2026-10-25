<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:');putenv('APP_ENV=testing');putenv('STRIPE_SECRET_KEY=sk_test_mock');putenv('STRIPE_WEBHOOK_SECRET=whsec_mock');putenv('FLW_SECRET_KEY=');
require __DIR__.'/../src/bootstrap.php';require __DIR__.'/../src/Wallet.php';require __DIR__.'/../src/Payments.php';
foreach(glob(__DIR__.'/../migrations/*.sql')as$f)db()->exec(file_get_contents($f));
$uid=id();query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$uid,'Stripe QA','stripe@example.invalid','unused',id(),now()]);query('INSERT INTO wallets (user_id) VALUES (?)',[$uid]);$u=one('SELECT * FROM users WHERE id=?',[$uid]);$passed=0;
function test(string$n,callable$f):void{global$passed;$f();$passed++;echo "PASS $n\n";}
function eq(mixed$a,mixed$b):void{if($a!==$b)throw new \RuntimeException(var_export($a,true).' !== '.var_export($b,true));}
function rejects(callable$f,string$code):void{try{$f();}catch(Problem$e){eq($e->key,$code);return;}throw new \RuntimeException('Expected '.$code);}
test('Stripe is default when configured and reports test mode',function(){eq(Payments::options()['provider'],'stripe');eq(Payments::options()['providers'][0]['test_mode'],true);});
test('Test keys are disabled in production',function(){putenv('APP_ENV=production');eq(StripeFunding::enabled(),false);putenv('APP_ENV=testing');});
test('USD quotes use server amount and bind provider/owner',function()use($u){$q=Payments::quote($u,['amount_usd'=>'10.00','provider'=>'stripe']);eq($q['checkout_amount'],'10.00');eq($q['checkout_currency'],'USD');eq(one('SELECT provider FROM funding_quotes WHERE id=?',[$q['id']])['provider'],'stripe');});
test('Bounds and unknown providers rejected',function()use($u){rejects(fn()=>Payments::quote($u,['amount_usd'=>'0.50','provider'=>'stripe']),'INVALID_AMOUNT');rejects(fn()=>Payments::quote($u,['amount_usd'=>'10.00','provider'=>'fake']),'INVALID_PROVIDER');});
test('Expired and non-owned quotes cannot open checkout',function()use($u){$q=StripeFunding::quote($u,['amount_usd'=>'10.00']);query('UPDATE funding_quotes SET expires_at=? WHERE id=?',[gmdate('Y-m-d H:i:s',time()-1),$q['id']]);rejects(fn()=>StripeFunding::checkout($u,['quote_id'=>$q['id']]),'QUOTE_EXPIRED');rejects(fn()=>Payments::create(['id'=>id()],['quote_id'=>$q['id']]),'NOT_FOUND');});
$id=id();query('INSERT INTO payments (id,user_id,provider,provider_reference,amount_cents,currency,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',[$id,$uid,'stripe','cs_test_test',1000,'USD','pending',now(),now()]);$s=['id'=>'cs_test_test','metadata'=>['payment_id'=>$id,'user_id'=>$uid],'client_reference_id'=>$id,'amount_total'=>1000,'currency'=>'usd','payment_status'=>'paid','mode'=>'payment','livemode'=>false];
test('Pending payment never credits wallet',function()use($id,$s,$uid){eq(Payments::credit($id,array_replace($s,['payment_status'=>'unpaid']))['status'],'pending');eq(Wallet::balance($uid)['balance_usd'],'0.00');});
test('Amount, currency, owner, mode, environment and session mismatches rejected',function()use($id,$s){foreach([['amount_total'=>999],['currency'=>'gbp'],['id'=>'cs_test_other'],['metadata'=>['payment_id'=>$id,'user_id'=>'other']],['mode'=>'subscription'],['livemode'=>true]]as$change)rejects(fn()=>Payments::credit($id,array_replace($s,$change)),'PAYMENT_MISMATCH');});
test('Expired checkout records failure without credit',function()use($id,$s,$uid){eq(Payments::credit($id,array_replace($s,['payment_status'=>'unpaid','status'=>'expired']))['status'],'failed');eq(Wallet::balance($uid)['balance_usd'],'0.00');});
test('Paid checkout credits exact USD once even after expired callback',function()use($id,$s,$uid){Payments::credit($id,$s);Payments::credit($id,$s);eq(Wallet::balance($uid)['balance_usd'],'10.00');eq((int)one("SELECT COUNT(*) n FROM ledger WHERE kind='topup'")['n'],1);});
test('Forged and old webhook signatures rejected',function(){rejects(fn()=>StripeCheckout::webhook('{}','t='.time().',v1=bad'),'INVALID_SIGNATURE');$t=time()-600;$signature=hash_hmac('sha256',$t.'.{}','whsec_mock');rejects(fn()=>StripeCheckout::webhook('{}','t='.$t.',v1='.$signature),'INVALID_SIGNATURE');});
test('Valid signature supports secret rotation and ignores unrelated events',function(){$raw='{"type":"unrelated"}';$t=time();$signature=hash_hmac('sha256',$t.'.'.$raw,'whsec_mock');$event=StripeCheckout::webhook($raw,'t='.$t.',v1=old,v1='.$signature);eq(StripeFunding::handleEvent($event)['received'],true);});
echo "$passed Stripe tests passed\n";

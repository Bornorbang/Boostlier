<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';
foreach(['Wallet','Pricing','Providers','Rentals','Payments','Rewards','Commerce','SmmOrders','TempMail','Ads'] as $file)require __DIR__.'/../src/'.$file.'.php';
header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');
try {
 $path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$method=$_SERVER['REQUEST_METHOD'];
 if($method==='OPTIONS'){http_response_code(405);exit;}
 if($method!=='GET'&&isset($_SERVER['HTTP_ORIGIN'])&&$_SERVER['HTTP_ORIGIN']!==env('APP_URL','http://localhost:3000'))fail('ORIGIN_REJECTED','Request origin rejected.',403);
 if($path==='/health')json(['status'=>'ok']);
 if($path==='/public/config')json(['currency'=>'USD','google_enabled'=>(bool)(env('GOOGLE_CLIENT_ID')&&env('GOOGLE_CLIENT_SECRET')),'minimum_topup_usd'=>env('MIN_TOPUP_CENTS')!==''?money((int)env('MIN_TOPUP_CENTS')):null]);
 if($path==='/public/prices'&&$method==='GET')json(Pricing::snapshot((string)($_GET['catalogue']??'usa'),(string)($_GET['country']??'united-kingdom'),($_GET['wholesale']??'0')==='1'));
 if(str_starts_with($path,'/auth/')){require __DIR__.'/../src/auth-routes.php';fail('NOT_FOUND','Route not found.',404);}
 if($path==='/webhooks/flutterwave'&&$method==='POST')json(Flutterwave::webhook(file_get_contents('php://input'),$_SERVER['HTTP_VERIF_HASH']??''));
 if($path==='/webhooks/stripe'&&$method==='POST')json(StripeFunding::handleEvent(StripeCheckout::webhook(file_get_contents('php://input'),$_SERVER['HTTP_STRIPE_SIGNATURE']??'')));
 if(str_starts_with($path,'/admin/')){require __DIR__.'/../src/admin-routes.php';fail('NOT_FOUND','Route not found.',404);}
 $isApi=str_starts_with($path,'/api/v1/');$u=user($isApi);$route=$isApi?substr($path,7):$path;
 if(!$isApi&&$method==='GET'&&$route==='/balance'){Rentals::expireDue($u['id']);json(Wallet::balance($u['id']));}
 if($isApi&&$method==='GET'&&$route==='/prices'){
  if(isset($_GET['service'])){$service=required($_GET,'service',120);$quote=provider('textverified')->quote($service,'usa',[]);$config=Pricing::setting('textverified_pricing');if(!$config||($config['currency']??'')!==$quote['currency'])fail('PRICING_UNCONFIGURED','Number pricing is not configured.',503);json(['currency'=>'USD','state'=>'live','items'=>[['id'=>$service,'service'=>$service,'stock'=>$quote['stock'],'price_usd'=>money(Pricing::numberQuote($quote['cost_minor'],'textverified',$config,'wholesale'))]]]);}
  $catalogue=provider('textverified')->catalogue('usa');json(['currency'=>'USD','items'=>[],'services'=>$catalogue['items'],'message'=>'Supply ?service=SERVICE_ID for a current USD quote and stock.']);
 }

 if($method==='POST'&&$route==='/rent')json(Rentals::purchase($u,body(),$_SERVER['HTTP_IDEMPOTENCY_KEY']??'',$isApi),202);
 if($method==='POST'&&in_array($route,['/status','/cancel'],true)){ $o=Rentals::owned(required(body(),'rental_id',32),$u['id']);if($isApi&&!in_array($o['product'],['usa','global'],true))fail('INVALID_PRODUCT','Use the number-rentals API for long-term rentals.');json(Rentals::sync($o,$route==='/cancel')); }
 if($method==='POST'&&$route==='/finish'){$o=Rentals::owned(required(body(),'rental_id',32),$u['id']);if($o['product']!=='global')fail('INVALID_PRODUCT','Finish is a global-rental action.');if(!$o['provider_order_id'])fail('PROVISIONING_PENDING','Provider confirmation is pending.',409);json(Rentals::settle($o['id'],provider($o['provider'])->finish($o['provider_order_id'])));}
 if($method==='GET'&&in_array($route,['/rentals','/history'],true)){
  [$page,$limit]=paginate();
  json(Rentals::listing($u,($_GET['product']??null),($_GET['active']??'')==='1',$page,$limit));
 }

 if($isApi){
  require __DIR__.'/../src/developer-routes.php';
  fail('NOT_FOUND','API endpoint not found.',404);
 }
 if($route==='/dashboard-notice'&&$method==='GET'){require_once __DIR__.'/../src/DashboardNotice.php';json(DashboardNotice::read());}
 require __DIR__.'/../src/temp-mail-routes.php';
 require __DIR__.'/../src/ads-routes.php';
 require __DIR__.'/../src/number-routes.php';
 require __DIR__.'/../src/global-number-routes.php';
 if($route==='/wallet'&&$method==='GET')json(Wallet::balance($u['id'])+['ledger'=>all('SELECT kind,amount_cents,reference,description,created_at FROM ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[$u['id']]),'payments'=>all('SELECT id,amount_cents,currency,status,created_at,checkout_currency,checkout_minor FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[$u['id']])]);
 if($route==='/payments/options'&&$method==='GET')json(Payments::options());
 if($route==='/payments/quote'&&$method==='POST'){rateLimit('funding-quote:'.$u['id'],20,60);json(Payments::quote($u,body()));}
 if($route==='/payments/checkout'&&$method==='POST'){rateLimit('checkout:'.$u['id'],5,60);json(Payments::create($u,body()));}
 if($route==='/payments/verify'&&$method==='POST')json(Payments::verify(required(body(),'reference',32),$u['id']));
 if($route==='/profile'&&$method==='PATCH'){$name=required(body(),'name',120);query('UPDATE users SET name=? WHERE id=?',[$name,$u['id']]);json(['user'=>safeUser(one('SELECT * FROM users WHERE id=?',[$u['id']]))]);}
 if($route==='/profile/change-password'&&$method==='POST'){$b=body();if(!password_verify(required($b,'current_password',200),$u['password_hash']))fail('INVALID_PASSWORD','Your current password is incorrect.');$p=required($b,'password',200);if(strlen($p)<12)fail('WEAK_PASSWORD','Use at least 12 characters.');tx(function()use($p,$u){query('UPDATE users SET password_hash=? WHERE id=?',[password_hash($p,PASSWORD_DEFAULT),$u['id']]);query('DELETE FROM sessions WHERE user_id=?',[$u['id']]);query('UPDATE reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL',[now(),$u['id']]);query("UPDATE transactional_mail SET status='cancelled' WHERE user_id=? AND kind='reset' AND status IN ('pending','sending')",[$u['id']]);});session($u);json(['message'=>'Password updated. Other sessions have been signed out.']);}
 if($route==='/api-keys'&&$method==='GET')json(['items'=>all('SELECT id,prefix,last_used_at,revoked_at,created_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC',[$u['id']])]);
 if($route==='/api-keys'&&$method==='POST'){rateLimit('key-rotation:'.$u['id'],10,60);$key='tn_'.bin2hex(random_bytes(28));tx(function()use($u,$key){one('SELECT id FROM users WHERE id=?'.lockSuffix(),[$u['id']]);query('UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',[now(),$u['id']]);query('INSERT INTO api_keys (id,user_id,key_hash,prefix,created_at) VALUES (?,?,?,?,?)',[id(),$u['id'],hash('sha256',$key),substr($key,0,12),now()]);audit('api_key_rotated',$u['id']);});json(['key'=>$key,'message'=>'Save this key now. It cannot be revealed again.']);}
 if($route==='/api-keys'&&$method==='DELETE'){query('UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=?',[now(),required(body(),'id',32),$u['id']]);audit('api_key_revoked',$u['id']);json(['message'=>'Key revoked.']);}
 if($route==='/announcements'&&$method==='GET')json(['items'=>all('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100')]);
 if($route==='/rewards'&&$method==='GET')json(Rewards::progress($u));
 if($route==='/rewards/claim'&&$method==='POST'){rateLimit('reward-claim:'.$u['id'],10,60);json(Rewards::claim($u,required(body(),'reward',80)));}
 if($route==='/support'&&$method==='POST'){if(($_POST['issue_type']??'')==='payment'){require_once __DIR__.'/../src/SupportRequests.php';rateLimit('support-query:'.$u['id'],10,3600);json(SupportRequests::upload($u,$_POST,$_FILES['receipt']??null,$_SERVER['HTTP_IDEMPOTENCY_KEY']??''),201);}if(str_contains($_SERVER['CONTENT_TYPE']??'','application/json')){require_once __DIR__.'/../src/SupportRequests.php';rateLimit('support-query:'.$u['id'],10,3600);json(SupportRequests::submit($u,body(),$_SERVER['HTTP_IDEMPOTENCY_KEY']??''),201);}require __DIR__.'/../src/support-route.php';}
 if($route==='/support'&&$method==='GET')json(['items'=>all('SELECT id,issue_type,payment_reference,status,created_at FROM support_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[$u['id']])]);
 if($route==='/smm/orders'&&$method==='GET')json(SmmOrders::listing($u));
 if($method==='GET'&&$route==='/long-term'){require_once __DIR__.'/../src/NumberRentals.php';json(NumberRentals::listing($u));}
 if($method==='GET'&&in_array($route,['/dedicated','/temp-mail','/smm/orders'],true)){$table=match($route){'/temp-mail'=>'inboxes','/smm/orders'=>'smm_orders',default=>'orders'};$where='user_id=?';$args=[$u['id']];if($table==='orders'){$where.=' AND product=?';$args[]=substr($route,1);}json(['items'=>all('SELECT * FROM '.$table.' WHERE '.$where.' ORDER BY created_at DESC LIMIT 100',$args),'state'=>'unavailable','message'=>'The provider is not connected. No purchases or renewals can be made yet.']);}
 require __DIR__.'/../src/number-rental-routes.php';
 require __DIR__.'/../src/commerce-routes.php';
 fail('NOT_FOUND','Route not found.',404);
}catch(Problem $e){json(['error'=>['code'=>$e->key,'message'=>$e->getMessage()]],$e->status);}catch(\Throwable $e){$incident=id();error_log('TempNumber incident '.$incident.' class='.get_class($e));json(['error'=>['code'=>'INTERNAL_ERROR','message'=>'The service could not complete your request. Reference: '.$incident]],500);}

<?php
declare(strict_types=1);
namespace TempNumber;

final class Flutterwave {
 public const REGIONS=[
  'US'=>['United States','USD','card'], 'NG'=>['Nigeria','NGN','card, banktransfer, ussd'],
  'GH'=>['Ghana','GHS','card, mobilemoneyghana'], 'KE'=>['Kenya','KES','card, mpesa'],
  'UG'=>['Uganda','UGX','card, mobilemoneyuganda'], 'RW'=>['Rwanda','RWF','card, mobilemoneyrwanda'],
  'TZ'=>['Tanzania','TZS','card, mobilemoneytanzania'], 'ZA'=>['South Africa','ZAR','card'],
  'GB'=>['United Kingdom','GBP','card'], 'EU'=>['Euro area','EUR','card'],
  'OTHER'=>['Other / pay in USD','USD','card']
 ];
 public static function request(string $method,string $path,array $data=[]):array {
  if(!env('FLW_SECRET_KEY'))fail('PAYMENT_UNAVAILABLE','Flutterwave checkout is not configured yet.',503);
  $base=env('APP_ENV')==='testing'?env('FLW_TEST_API_URL','https://api.flutterwave.com/v3'):'https://api.flutterwave.com/v3';
  $c=curl_init($base.'/'.$path);curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>15,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.env('FLW_SECRET_KEY'),'Content-Type: application/json']]);
  if($method==='POST'){curl_setopt($c,CURLOPT_POST,true);curl_setopt($c,CURLOPT_POSTFIELDS,json_encode($data,JSON_THROW_ON_ERROR));}
  $raw=curl_exec($c);$code=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);$v=$raw?json_decode($raw,true):null;
  if($code<200||$code>=300||!is_array($v)||($v['status']??'')!=='success'||!is_array($v['data']??null))fail('PAYMENT_UNAVAILABLE','Flutterwave could not confirm this request. No wallet credit has been applied. Check your top-up history before trying again.',503);
  return $v['data'];
 }
 public static function options():array {
  $country='OTHER';
  if(env('BACKEND_PROXY_SECRET')&&hash_equals(env('BACKEND_PROXY_SECRET'),$_SERVER['HTTP_X_BOOSTLIER_PROXY_SECRET']??''))$country=strtoupper($_SERVER['HTTP_X_BOOSTLIER_COUNTRY']??'OTHER');
  if(in_array($country,['AT','BE','CY','DE','EE','ES','FI','FR','GR','HR','IE','IT','LT','LU','LV','MT','NL','PT','SI','SK'],true))$country='EU';
  if(!isset(self::REGIONS[$country]))$country='OTHER';
  return ['country'=>$country,'enabled'=>env('FLW_SECRET_KEY')!==''&&env('FLW_SECRET_HASH')!=='','minimum_usd'=>money(max(100,(int)env('MIN_TOPUP_CENTS','100'))),'maximum_usd'=>money((int)env('MAX_TOPUP_CENTS','1000000')),'countries'=>array_map(fn($code,$r)=>['code'=>$code,'name'=>$r[0]],array_keys(self::REGIONS),array_values(self::REGIONS))];
 }
 public static function minor(mixed $value,string $currency,bool $roundUp=true):int {
  if(!is_int($value)&&!is_float($value)&&!is_string($value))fail('PAYMENT_MISMATCH','Invalid payment amount.',409);
  $s=is_float($value)?rtrim(rtrim(sprintf('%.8F',$value),'0'),'.'):(string)$value;
  if(!preg_match('/^\d{1,12}(\.\d{1,8})?$/D',$s))fail('PAYMENT_MISMATCH','Invalid payment amount.',409);
  $digits=in_array($currency,['UGX','RWF'],true)?0:2;
  $scaled=bcmul($s,(string)(10**$digits),8);$floor=bcdiv($scaled,'1',0);
  return (int)$floor+($roundUp&&bccomp($scaled,$floor,8)>0?1:0);
 }
 public static function decimal(int $minor,string $currency):string {return in_array($currency,['UGX','RWF'],true)?(string)$minor:money($minor);}
 public static function quote(array $u,array $b):array {
  if(!self::options()['enabled'])fail('PAYMENT_UNAVAILABLE','Flutterwave checkout is not configured yet.',503);
  $amount=cents($b['amount_usd']??null);$min=max(100,(int)env('MIN_TOPUP_CENTS','100'));
  if($amount<$min||$amount>(int)env('MAX_TOPUP_CENTS','1000000'))fail('INVALID_AMOUNT','Choose an amount within the supported funding range.');
  $country=strtoupper(required($b,'country',5));$region=self::REGIONS[$country]??null;if(!$region)fail('INVALID_COUNTRY','Choose a payment country.');
  $currency=$region[1];$minor=$amount;$fallback=false;
  if($currency!=='USD'){
   try{
    $rate=self::request('GET','transfers/rates?'.http_build_query(['amount'=>money($amount),'source_currency'=>$currency,'destination_currency'=>'USD']));
    if(($rate['source']['currency']??'')!==$currency||($rate['destination']['currency']??'')!=='USD'||self::minor($rate['destination']['amount']??null,'USD')!==$amount)fail('PAYMENT_MISMATCH','Unable to obtain a matching conversion quote.',409);
    $minor=self::minor($rate['source']['amount']??null,$currency);if($minor<=0)fail('PAYMENT_MISMATCH','Invalid conversion quote.',409);
   }catch(Problem){$currency='USD';$minor=$amount;$fallback=true;}
  }
  $id=id();$expires=gmdate('Y-m-d H:i:s',time()+300);$methods=$currency==='USD'?'card':$region[2];
  query('INSERT INTO funding_quotes (id,user_id,amount_cents,country,checkout_currency,checkout_minor,payment_options,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[$id,$u['id'],$amount,$country==='OTHER'?'ZZ':$country,$currency,$minor,$methods,$expires,now()]);
  return ['id'=>$id,'wallet_amount_usd'=>money($amount),'checkout_amount'=>self::decimal($minor,$currency),'checkout_currency'=>$currency,'payment_options'=>$methods,'expires_at'=>str_replace(' ','T',$expires).'Z','fallback'=>$fallback];
 }
 public static function checkout(array $u,array $b):array {
  if(!self::options()['enabled'])fail('PAYMENT_UNAVAILABLE','Flutterwave checkout is not configured yet.',503);
  $quote=required($b,'quote_id',32);
  [$p,$fresh]=tx(function()use($u,$quote){
   $q=one('SELECT * FROM funding_quotes WHERE id=? AND user_id=?'.lockSuffix(),[$quote,$u['id']]);if(!$q)fail('NOT_FOUND','Funding quote not found.',404);
   $old=one('SELECT * FROM payments WHERE funding_quote_id=?',[$quote]);if($old)return [$old,false];
   if($q['expires_at']<=now())fail('QUOTE_EXPIRED','This quote has expired. Review a fresh quote before continuing.',409);
   $id=id();query('INSERT INTO payments (id,user_id,provider,provider_reference,amount_cents,currency,status,created_at,updated_at,funding_quote_id,checkout_currency,checkout_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$u['id'],'flutterwave','boostlier_'.$id,$q['amount_cents'],'USD','pending',now(),now(),$quote,$q['checkout_currency'],$q['checkout_minor']]);
   return [one('SELECT * FROM payments WHERE id=?',[$id]),true];
  });
  if(!$fresh){if($p['checkout_url']&&$p['status']==='pending')return ['reference'=>$p['id'],'checkout_url'=>$p['checkout_url']];fail('CHECKOUT_PENDING','This payment is already being processed. Check your top-up history before starting another payment.',409);}
  $q=one('SELECT * FROM funding_quotes WHERE id=?',[$quote]);
  $r=self::request('POST','payments',['tx_ref'=>$p['provider_reference'],'amount'=>self::decimal((int)$p['checkout_minor'],$p['checkout_currency']),'currency'=>$p['checkout_currency'],'redirect_url'=>rtrim(env('APP_URL'),'/').'/payment/return?reference='.$p['id'],'customer'=>['email'=>$u['email'],'name'=>$u['name']],'payment_options'=>$q['payment_options'],'customizations'=>['title'=>'Boostlier wallet','description'=>'Add $'.money((int)$p['amount_cents']).' to your Boostlier wallet'],'meta'=>['payment_id'=>$p['id'],'user_id'=>$u['id']]]);
  $url=$r['link']??'';$host=parse_url($url,PHP_URL_HOST);
  if(!is_string($url)||parse_url($url,PHP_URL_SCHEME)!=='https'||!in_array($host,['checkout.flutterwave.com','checkout.flutterwave.com:443'],true))fail('PAYMENT_UNAVAILABLE','Flutterwave did not return a valid checkout link.',503);
  query('UPDATE payments SET checkout_url=?,updated_at=? WHERE id=?',[$url,now(),$p['id']]);return ['reference'=>$p['id'],'checkout_url'=>$url];
 }
 public static function verify(array $p):array {return self::credit($p['id'],self::request('GET','transactions/verify_by_reference?tx_ref='.rawurlencode($p['provider_reference'])));}
 public static function credit(string $id,array $s):array {
  return tx(function()use($id,$s){
   $p=one('SELECT * FROM payments WHERE id=?'.lockSuffix(),[$id]);if(!$p||$p['provider']!=='flutterwave')fail('NOT_FOUND','Payment not found.',404);
   if(($s['tx_ref']??'')!==$p['provider_reference']||($s['currency']??'')!==$p['checkout_currency']||self::minor($s['amount']??null,$p['checkout_currency'],false)<(int)$p['checkout_minor']||empty($s['id']))fail('PAYMENT_MISMATCH','Payment currency, reference or amount does not match.',409);
   if($p['status']==='successful')return ['status'=>'successful','reference'=>$id];
   if(($s['status']??'')!=='successful'){
    if(in_array($s['status']??'',['failed','cancelled'],true)){query("UPDATE payments SET status='failed',updated_at=? WHERE id=?",[now(),$id]);return ['status'=>'failed','reference'=>$id];}
    return ['status'=>'pending','reference'=>$id];
   }
   Wallet::change($p['user_id'],'topup',(int)$p['amount_cents'],'topup:'.$id,'Verified Flutterwave USD top-up');
   query("UPDATE payments SET status='successful',updated_at=? WHERE id=?",[now(),$id]);audit('flutterwave_payment_verified',$p['user_id'],['payment_id'=>$id,'transaction_id'=>(string)$s['id']]);
   return ['status'=>'successful','reference'=>$id];
  });
 }
 public static function webhook(string $raw,string $signature):array {
  if(!env('FLW_SECRET_HASH')||!hash_equals(env('FLW_SECRET_HASH'),$signature))fail('INVALID_SIGNATURE','Invalid webhook signature.',401);
  $event=json_decode($raw,true);if(!is_array($event))fail('INVALID_JSON','Invalid webhook.',400);
  if(($event['event']??'')==='charge.completed'){
   $ref=$event['data']['tx_ref']??'';
   if(is_string($ref)){$p=one("SELECT * FROM payments WHERE provider='flutterwave' AND provider_reference=?",[$ref]);if($p)self::verify($p);}
  }
  return ['received'=>true];
 }
}

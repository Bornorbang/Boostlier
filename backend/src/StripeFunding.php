<?php
declare(strict_types=1);
namespace TempNumber;
final class StripeFunding {
 public static function enabled():bool {
  $key=env('STRIPE_SECRET_KEY');
  return $key!==''&&(env('APP_ENV')!=='production'||(str_starts_with($key,'sk_live_')&&env('STRIPE_WEBHOOK_SECRET')!==''));
 }
 public static function quote(array $u,array $b):array {
  if(!self::enabled())fail('PAYMENT_UNAVAILABLE','Stripe checkout is not configured.',503);
  $amount=cents($b['amount_usd']??null);if($amount<max(100,(int)env('MIN_TOPUP_CENTS','100'))||$amount>(int)env('MAX_TOPUP_CENTS','1000000'))fail('INVALID_AMOUNT','Choose an amount within the supported funding range.');
  $id=id();$expires=gmdate('Y-m-d H:i:s',time()+300);
  query('INSERT INTO funding_quotes (id,user_id,amount_cents,country,checkout_currency,checkout_minor,payment_options,expires_at,created_at,provider) VALUES (?,?,?,?,?,?,?,?,?,?)',[$id,$u['id'],$amount,'ZZ','USD',$amount,'stripe', $expires,now(),'stripe']);
  return ['id'=>$id,'provider'=>'stripe','wallet_amount_usd'=>money($amount),'checkout_amount'=>money($amount),'checkout_currency'=>'USD','payment_options'=>'stripe','expires_at'=>str_replace(' ','T',$expires).'Z','fallback'=>false];
 }
 public static function checkout(array $u,array $b):array {
  if(!self::enabled())fail('PAYMENT_UNAVAILABLE','Stripe checkout is not configured.',503);
  $quote=required($b,'quote_id',32);
  $p=tx(function()use($quote,$u){
   $q=one('SELECT * FROM funding_quotes WHERE id=? AND user_id=?'.lockSuffix(),[$quote,$u['id']]);if(!$q||$q['provider']!=='stripe')fail('NOT_FOUND','Funding quote not found.',404);
   $old=one('SELECT * FROM payments WHERE funding_quote_id=?',[$quote]);if($old)return $old;
   if($q['expires_at']<=now())fail('QUOTE_EXPIRED','This quote has expired. Refresh it before continuing.',409);
   $id=id();query('INSERT INTO payments (id,user_id,provider,amount_cents,currency,status,created_at,updated_at,funding_quote_id,checkout_currency,checkout_minor,customer_email) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$u['id'],'stripe',$q['amount_cents'],'USD','pending',now(),now(),$quote,'USD',$q['amount_cents'],$u['email']]);
   return one('SELECT * FROM payments WHERE id=?',[$id]);
  });
  if($p['status']!=='pending')fail('CHECKOUT_FINISHED','This payment is already finished. Check your top-up history.',409);
  if($p['provider_reference']){
   if($p['checkout_url'])return ['reference'=>$p['id'],'checkout_url'=>$p['checkout_url']];
   fail('CHECKOUT_PENDING','Check this payment in your top-up history.',409);
  }
  return self::open($p);
 }
 public static function open(array $p):array {
  // Stripe retains idempotency keys for at least 24h. Never recreate an ambiguous older session.
  if(strtotime($p['created_at'])<time()-23*3600)fail('CHECKOUT_REVIEW','This checkout needs review. Contact support with its payment reference.',409);
  $s=(new StripeCheckout())->create($p);$url=$s['url']??null;
  if(!is_string($s['id']??null)||!str_starts_with($s['id'],'cs_')||!is_string($url)||parse_url($url,PHP_URL_SCHEME)!=='https'||parse_url($url,PHP_URL_HOST)!=='checkout.stripe.com')fail('PAYMENT_UNAVAILABLE','Stripe did not return a valid checkout link. Check your top-up history.',503);
  tx(function()use($p,$s,$url){
   $locked=one('SELECT * FROM payments WHERE id=?'.lockSuffix(),[$p['id']]);
   if($locked['provider_reference']!==null&&$locked['provider_reference']!==$s['id'])fail('PAYMENT_MISMATCH','Checkout session does not match.',409);
   query('UPDATE payments SET provider_reference=?,checkout_url=?,updated_at=? WHERE id=?',[$s['id'],$url,now(),$p['id']]);
  });
  return ['reference'=>$p['id'],'checkout_url'=>$url];
 }
 public static function handleEvent(array $event):array {
  if(!in_array($event['type']??'',['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'],true))return ['received'=>true];
  $s=$event['data']['object']??[];$id=$s['metadata']['payment_id']??null;
  if(!is_string($id)||!is_string($s['id']??null))return ['received'=>true];
  $p=one("SELECT * FROM payments WHERE id=? AND provider='stripe'",[$id]);if(!$p)return ['received'=>true];
  $verified=(new StripeCheckout())->verify($s['id']);$result=Payments::credit($id,$verified);
  if(($event['type']??'')==='checkout.session.async_payment_failed'&&$result['status']!=='successful')query("UPDATE payments SET status='failed',updated_at=? WHERE id=? AND status='pending'",[now(),$id]);
  return ['received'=>true];
 }
}

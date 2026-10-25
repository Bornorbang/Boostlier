<?php
declare(strict_types=1);
namespace TempNumber;
$parts=explode('/',trim($route,'/'));$product=$parts[0];$action=$parts[1]??'';
if(!in_array($product,['long-term','dedicated','temp-mail','smm'],true))return;
if($product==='long-term'){
 if($action==='auto-renew')fail('AUTO_RENEW_UNAVAILABLE','Rentals are extended manually.');
 $route='/number-rentals/'.($action==='renew'?'extend':$action);
 require __DIR__.'/number-rental-routes.php';
 return;
}
if($method==='GET'&&$action==='catalogue')json(Commerce::adapter($product)->catalogue($product));
if($method==='POST'&&$action==='quote')json(Commerce::quote($product,body()));
if($method==='POST'&&in_array($action,['purchase','renew'],true))json(Commerce::fulfil($u,$product,$action==='renew'?'renewal':'purchase',body(),$_SERVER['HTTP_IDEMPOTENCY_KEY']??''),202);
if($product==='smm'&&$method==='POST'){if($action==='status')json(SmmOrders::refresh(Commerce::owned('smm',required(body(),'id',32),$u['id'])));if($action==='refill')json(SmmOrders::refill($u,required(body(),'id',32)));if($action==='refill-status')json(SmmOrders::refillStatus($u,required(body(),'id',32)));if($action==='cancel')fail('CANCELLATION_UNAVAILABLE','This provider does not support cancellation.');}
if($method==='POST'&&in_array($action,['status','cancel','refill'],true))json(Commerce::synchronise($product,Commerce::owned($product,required(body(),'id',32),$u['id']),$action));
if(in_array($product,['long-term','dedicated'],true)&&$method==='GET'&&in_array($action,['messages','message'],true)){$resource=Commerce::owned($product,required($_GET,'id',32),$u['id']);$adapter=Commerce::adapter($product);if($action==='messages')json(['items'=>$adapter->messages($resource['provider_order_id'])]);$m=$adapter->message($resource['provider_order_id'],required($_GET,'message_id',120));json(['subject'=>strip_tags((string)($m['subject']??'SMS')),'text'=>strip_tags((string)($m['text']??$m['body']??''))]);}
if($product==='long-term'&&$action==='auto-renew')fail('AUTO_RENEW_UNAVAILABLE','Rentals are extended manually.');
if($method==='POST'&&$action==='auto-renew'&&in_array($product,['long-term','dedicated'],true)){$b=body();$o=Commerce::owned($product,required($b,'id',32),$u['id']);if(!is_bool($b['enabled']??null))fail('VALIDATION_ERROR','enabled must be a boolean.');query('UPDATE orders SET auto_renew=? WHERE id=?',[$b['enabled']?1:0,$o['id']]);json(['message'=>'Auto-renew preference saved.']);}
if($product==='temp-mail'&&in_array($action,['messages','message','delete'],true)){$id=$method==='GET'?required($_GET,'id',32):required(body(),'id',32);$inbox=Commerce::owned($product,$id,$u['id']);if(!$inbox['provider_id'])fail('PROVISIONING_PENDING','Inbox provisioning is pending.',409);$adapter=Commerce::adapter($product);if($method==='GET'&&$action==='messages')json(['items'=>$adapter->messages($inbox['provider_id'])]);if($method==='GET'&&$action==='message'){$m=$adapter->message($inbox['provider_id'],required($_GET,'message_id',120));json(['subject'=>strip_tags((string)($m['subject']??'')),'text'=>html_entity_decode(strip_tags((string)($m['text']??$m['html']??'')),ENT_QUOTES|ENT_HTML5,'UTF-8')]);}if($method==='POST'&&$action==='delete'){if((body()['confirmed']??false)!==true)fail('CONFIRMATION_REQUIRED','Confirm deletion of the inbox.');if(!$adapter->delete($inbox['provider_id']))fail('DELETE_PENDING','Deletion is not confirmed.',409);query("UPDATE inboxes SET status='deleted' WHERE id=?",[$id]);json(['message'=>'Inbox deleted.']);}}

<?php
declare(strict_types=1);
namespace TempNumber;
if(!str_starts_with($route,'/number-rentals'))return;
require_once __DIR__.'/NumberRentals.php';
$action=substr($route,strlen('/number-rentals'));
if($method==='POST'&&$action==='/sync'){
 rateLimit('rental-sync:'.$u['id'],8,60);require_once __DIR__.'/NumberSync.php';json(NumberSync::run($u['id']));
}
if($method==='GET'&&$action==='')json(NumberRentals::listing($u));
if($method==='GET'&&$action==='/catalogue'){rateLimit('rental-catalogue:'.$u['id'],15,60);json(Commerce::adapter('long-term')->catalogue('long-term'));}
if($method==='POST'&&$action==='/quote'){rateLimit('rental-quote:'.$u['id'],20,60);json(NumberRentals::quote($u,body()));}
if($method==='POST'&&in_array($action,['/purchase','/extend'],true)){
 rateLimit('rental-purchase:'.$u['id'],10,60);
 $input=body();if(!isset($input['max_price_usd']))fail('PRICE_REQUIRED','Check the rental price before purchasing.');
 if($action==='/extend')NumberRentals::owned($u,required($input,'id',32));
 json(Commerce::fulfil($u,'long-term',$action==='/extend'?'renewal':'purchase',$input,$_SERVER['HTTP_IDEMPOTENCY_KEY']??''),202);
}
if($method==='POST'&&in_array($action,['/status','/cancel'],true)){
 rateLimit('rental-status:'.$u['id'],30,60);$row=NumberRentals::owned($u,required(body(),'id',32));
 json(Commerce::synchronise('long-term',$row,$action==='/cancel'?'cancel':'status'));
}
if($method==='GET'&&$action==='/messages'){rateLimit('rental-inbox:'.$u['id'],20,60);json(NumberRentals::inbox($u,required($_GET,'id',32)));}
if($method==='POST'&&$action==='/recover'){
 $intent=one("SELECT id FROM fulfilment_intents WHERE id=? AND user_id=? AND product='long-term'",[required(body(),'id',32),$u['id']]);if(!$intent)fail('NOT_FOUND','Rental operation not found.',404);
 require_once __DIR__.'/Reconciliation.php';json(Reconciliation::run($intent['id']));
}
fail('NOT_FOUND','Rental route not found.',404);

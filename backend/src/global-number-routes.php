<?php
declare(strict_types=1);
namespace TempNumber;
if($route==='/global-numbers/countries'&&$method==='GET'){
 rateLimit('global-countries:'.$u['id'],15,60);$items=[];
 foreach(provider('5sim')->countries()as$id=>$country){if(is_array($country)&&preg_match('/^[a-z0-9_-]{1,80}$/D',(string)$id))$items[]=['id'=>(string)$id,'name'=>strip_tags((string)($country['text_en']??ucfirst((string)$id)))];}
 usort($items,fn($a,$b)=>strcasecmp($a['name'],$b['name']));json(['items'=>$items]);
}
if($route==='/global-numbers/services'&&$method==='GET'){
 rateLimit('global-services:'.$u['id'],15,60);json(['items'=>provider('5sim')->services()]);
}
if($route==='/global-numbers/prices'&&$method==='GET'){
 rateLimit('global-prices:'.$u['id'],20,60);$config=Pricing::setting('5sim_pricing');if(!$config||($config['currency']??'')!=='USD')fail('PRICING_UNCONFIGURED','Global number pricing requires configuration.',503);
 json(provider('5sim')->prices(required($_GET,'service',80),$config));
}
if($route==='/global-numbers/sync'&&$method==='POST'){
 rateLimit('global-sync:'.$u['id'],8,60);require_once __DIR__.'/NumberSync.php';json(NumberSync::run($u['id']));
}

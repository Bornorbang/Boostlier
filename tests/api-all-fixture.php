<?php
declare(strict_types=1);
namespace TempNumber;
if(!str_contains(getenv('DB_DSN')?:'','admin-qa-api-all-'))exit(1);
ob_start();require __DIR__.'/admin-fixture.php';$fixture=json_decode(ob_get_clean(),true);
require_once __DIR__.'/../backend/src/Wallet.php';
require_once __DIR__.'/../backend/src/Pricing.php';
query('UPDATE wallets SET balance_cents=10000 WHERE user_id=?',[$fixture['customer']['id']]);
query('UPDATE inboxes SET provider_id=? WHERE id=?',[md5('test@example.invalid'),$fixture['inbox']]);
$expiry='2099-01-01 00:00:00';
foreach([
 'services'=>['items'=>[['id'=>'facebook','service'=>'Facebook','capability'=>'sms']],'currency'=>'USD','country'=>'usa'],
 'price:'.hash('sha256','facebook')=>['service'=>'facebook','currency'=>'USD','cost_minor'=>100],
 'rental-services'=>['items'=>[['id'=>'facebook','name'=>'Facebook'],['id'=>'google','name'=>'Google']],'durations'=>['sevenDay'=>'7 days']],
]as$key=>$payload)query('INSERT INTO textverified_cache (id,payload,expires_at) VALUES (?,?,?)',[$key,json_encode($payload),$expiry]);
foreach([
 'countries'=>['england'=>['text_en'=>'England','iso'=>['gb'=>1]]],
 'services'=>[['id'=>'facebook','name'=>'Facebook']],
 'prices:facebook'=>['facebook'=>['england'=>['testop'=>['cost'=>1,'count'=>10,'rate'=>99]]]],
]as$key=>$payload)query('INSERT INTO fivesim_cache (id,payload,expires_at) VALUES (?,?,?)',[$key,json_encode($payload),$expiry]);
$social=[['id'=>'101','name'=>'Social Likes','category'=>'Social','type'=>'Default','minimum'=>100,'maximum'=>10000,'description'=>'Social Likes','rate'=>'1000','refill'=>true]];
query('INSERT INTO smm_catalogue_cache (id,payload,updated_at) VALUES (?,?,?)',['services',json_encode($social),now()]);
query('UPDATE smm_orders SET last_status_at=? WHERE user_id=?',[now(),$fixture['customer']['id']]);
$fixture['social']=one('SELECT id FROM smm_orders WHERE user_id=?',[$fixture['customer']['id']])['id'];
$fixture['refill']=id();query('INSERT INTO smm_refills (id,order_id,status,created_at,updated_at) VALUES (?,?,?,?,?)',[$fixture['refill'],$fixture['social'],'completed',now(),now()]);
$fixture['operation']=one('SELECT id FROM fulfilment_intents WHERE user_id=?',[$fixture['customer']['id']])['id'];
query("UPDATE fulfilment_intents SET status='completed' WHERE id=?",[$fixture['operation']]);
$fixture['global']=id();query('INSERT INTO orders (id,user_id,provider,product,service,phone,sms_code,status,price_cents,price_tier,idempotency_key,request_hash,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$fixture['global'],$fixture['customer']['id'],'5sim','global','facebook','+447350690992','000123','completed',200,'wholesale',id(),'hash',now(),now(),$expiry]);
echo json_encode($fixture);

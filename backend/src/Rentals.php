<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/RewardAccounting.php';
final class Rentals {
 public static function purchase(array $user,array $input,string $key,bool $wholesale=false,?NumberProvider $adapterOverride=null):array {
  self::expireDue($user['id']);
  if(!preg_match('/^[a-zA-Z0-9_-]{8,100}$/D',$key))fail('IDEMPOTENCY_REQUIRED','Use an Idempotency-Key of 8–100 letters, numbers, underscores or hyphens.');
  $service=required($input,'service',120);if(isset($input['options'])&&!is_array($input['options']))fail('VALIDATION_ERROR','Rental options must be an object.');$catalogue=$input['catalogue']??'usa';if(!in_array($catalogue,['usa','global'],true))fail('INVALID_CATALOGUE','Choose USA or global.');
  $country=$catalogue==='usa'?'usa':required($input,'country',80);$source=$catalogue==='usa'?'textverified':'5sim';$maximum=isset($input['max_price_usd'])?cents($input['max_price_usd']):null;
  $normal=['service'=>$service,'catalogue'=>$catalogue,'country'=>$country,'max_price_cents'=>$maximum,'options'=>$input['options']??[],'tier'=>$wholesale?'wholesale':'retail'];$hash=hash('sha256',json_encode($normal,JSON_THROW_ON_ERROR));
  $existing=one('SELECT * FROM orders WHERE user_id=? AND idempotency_key=?',[$user['id'],$key]);if($existing){if(!hash_equals($existing['request_hash'],$hash))fail('IDEMPOTENCY_CONFLICT','This key was used with different input.',409);return self::public($existing);}
  $adapter=$adapterOverride??provider($source);$quote=$adapter->quote($service,$country,$normal['options']);if((int)($quote['stock']??0)<1)fail('OUT_OF_STOCK','This service has no confirmed available stock.');$config=Pricing::setting($source.'_pricing');if(!$config)fail('PRICING_UNCONFIGURED','Commercial pricing is not configured.',503);
  if(($quote['currency']??'')!==$config['currency'])fail('PRICING_UNCONFIGURED','The provider billing currency must be verified.',503);
  $price=Pricing::numberQuote((int)$quote['cost_minor'],$source,$config,$normal['tier']);if($maximum!==null&&$price>$maximum)fail('PRICE_EXCEEDS_MAX','The current quote exceeds max_price_usd.');$intent=id();
  $record=tx(function()use($user,$key,$hash,$source,$catalogue,$country,$service,$price,$normal,$intent,$quote,$config){one('SELECT user_id FROM wallets WHERE user_id=?'.lockSuffix(),[$user['id']]);$existing=one('SELECT * FROM orders WHERE user_id=? AND idempotency_key=?',[$user['id'],$key]);if($existing){if(!hash_equals($existing['request_hash'],$hash))fail('IDEMPOTENCY_CONFLICT','This key was used with different input.',409);return $existing;}if(one("SELECT id FROM orders WHERE user_id=? AND provider=? AND service=? AND country=? AND status IN ('pending','reconciliation')",[$user['id'],$source,$service,$country]))fail('ORDER_PENDING','A matching global order is awaiting confirmation. Check History before purchasing again.',409);$count=one("SELECT COUNT(*) AS n FROM orders WHERE user_id=? AND status IN ('active','pending','reconciliation')",[$user['id']]);if($count['n']>=(int)env('ACTIVE_ORDER_LIMIT','10'))fail('ACTIVE_ORDER_LIMIT','The active order limit has been reached.');Wallet::change($user['id'],'reservation',0,'reserve:'.$intent,'Reserve funds for number rental',$price);query('INSERT INTO orders (id,user_id,provider,product,service,country,status,price_cents,price_tier,idempotency_key,request_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[$intent,$user['id'],$source,$catalogue,$service,$country,'pending',$price,$normal['tier'],$key,$hash,now(),now()]);RewardAccounting::record($intent,$user['id'],$intent,$catalogue,'purchase:'.$intent,$quote,$config);return one('SELECT * FROM orders WHERE id=?',[$intent]);});
  // Only the creator may dispatch this intent. Replays never send a second provider purchase.
  if($record['id']!==$intent)return self::public($record);if($source==='5sim')query('UPDATE orders SET provider_metadata=? WHERE id=?',[json_encode($quote),$intent]);
  try{$receipt=$adapter->purchase($intent,$quote);if(empty($receipt['id'])||empty($receipt['phone'])||empty($receipt['expires_at']))throw new AmbiguousProvisioning('Incomplete receipt');query('INSERT INTO provider_receipts (intent_id,receipt,created_at) VALUES (?,?,?)',[$intent,json_encode($receipt),now()]);tx(function()use($intent,$receipt,$user,$price){$order=one('SELECT * FROM orders WHERE id=?'.lockSuffix(),[$intent]);if($order['status']!=='pending')return;RewardAccounting::receipt($intent,$receipt);Wallet::change($user['id'],'purchase',-$price,'purchase:'.$intent,'Number rental',-$price);query("UPDATE orders SET provider_order_id=?,phone=?,expires_at=?,status='active',updated_at=?,provider_metadata=?,can_cancel=?,provider_state=? WHERE id=?",[$receipt['id'],$receipt['phone'],$receipt['expires_at'],now(),json_encode($receipt),!empty($receipt['can_cancel'])?1:0,$receipt['provider_state']??null,$intent]);});}
  catch(NumberProviderRejected $e){return self::settle($intent,['status'=>'cancelled','authoritative'=>true,'no_sms_confirmed'=>true]);}
  catch(\Throwable $e){query("UPDATE orders SET status='reconciliation',updated_at=? WHERE id=? AND status='pending'",[now(),$intent]);audit('order_reconciliation',$user['id'],['order_id'=>$intent]);}
  return self::public(one('SELECT * FROM orders WHERE id=?',[$intent]));
 }
 public static function listing(array $user,?string $product=null,bool $visibleOnly=false,int $page=1,int $limit=20):array {
  self::expireDue($user['id']);
  $page=max(1,$page);$limit=$visibleOnly?10:max(1,min(100,$limit));
  $clauses='user_id=?';$args=[$user['id']];
  if($product!==null){$clauses.=' AND product=?';$args[]=$product;}
  $activeTotal=(int)one("SELECT COUNT(*) AS n FROM orders WHERE ".$clauses." AND status='active' AND hidden_from_numbers=0 AND (expires_at IS NULL OR expires_at>?)",array_merge($args,[now()]))['n'];
  $completedTotal=(int)one("SELECT COUNT(*) AS n FROM orders WHERE ".$clauses." AND status='completed'",$args)['n'];
  if($visibleOnly){$clauses.=" AND status IN ('active','completed') AND hidden_from_numbers=0 AND (expires_at IS NULL OR expires_at>?)";$args[]=now();}
  $total=(int)one('SELECT COUNT(*) AS n FROM orders WHERE '.$clauses,$args)['n'];
  $items=all('SELECT * FROM orders WHERE '.$clauses.' ORDER BY created_at DESC,id DESC LIMIT '.$limit.' OFFSET '.(($page-1)*$limit),$args);
  return ['items'=>array_map([self::class,'public'],$items),'page'=>$page,'per_page'=>$limit,'total'=>$total,'active_total'=>$activeTotal,'active_completed_total'=>$activeTotal+$completedTotal];
 }
 public static function owned(string $id,string $user):array {$o=one('SELECT * FROM orders WHERE id=? AND user_id=?',[$id,$user]);if(!$o)fail('NOT_FOUND','Rental not found.',404);return $o;}
 /** Customer refunds do not depend on a supplier wallet credit. Only charged, code-free numbers qualify. */
 public static function expireDue(?string $user=null,int $limit=200):int {
  $args=[now()];$where="o.provider='textverified' AND o.product='usa' AND o.status IN ('active','reconciliation') AND (o.sms_code IS NULL OR o.sms_code='') AND ((o.expires_at IS NOT NULL AND o.expires_at<=?) OR o.hidden_from_numbers=1) AND EXISTS (SELECT 1 FROM ledger l WHERE l.user_id=o.user_id AND l.reference=";
  // CONCAT is not portable between SQLite and MySQL.
  $where.=db()->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?"CONCAT('purchase:',o.id)":"('purchase:' || o.id)";
  $where.=" AND l.amount_cents<0)";
  if($user!==null){$where.=' AND o.user_id=?';$args[]=$user;}
  $count=0;
  foreach(all('SELECT o.id,o.hidden_from_numbers FROM orders o WHERE '.$where.' ORDER BY o.expires_at,o.id LIMIT '.max(1,min(1000,$limit)),$args)as$row){
   $result=self::settle($row['id'],!empty($row['hidden_from_numbers'])?['status'=>'cancelled','accepted_cancel'=>true]:['status'=>'expired','local_timeout'=>true]);
   if(in_array($result['status'],['cancelled','expired'],true))$count++;
  }
  return $count;
 }
 public static function settle(string $id,array $confirmed):array {
  return tx(function()use($id,$confirmed){$o=one('SELECT * FROM orders WHERE id=?'.lockSuffix(),[$id]);if(!$o)fail('NOT_FOUND','Rental not found.',404);if(in_array($o['status'],['completed','cancelled','expired'],true))return self::public($o);
   // Only trusted adapters call this method. A status label without code is not completion.
   $code=(string)($confirmed['sms_code']??$o['sms_code']??'');$state=$confirmed['status']??'active';if($code!=='')$state='completed';else if($state==='completed'||$state==='received')$state='active';
   if(!in_array($state,['active','completed','cancelled','expired','reconciliation'],true))$state='reconciliation';
   $textVerified=$o['provider']==='textverified';
   $acceptedCancel=$textVerified&&(!empty($confirmed['cancel_requested'])||(!empty($confirmed['accepted_cancel'])&&!empty($o['hidden_from_numbers'])));
   $localTimeout=$textVerified&&!empty($confirmed['local_timeout'])&&!empty($o['expires_at'])&&$o['expires_at']<=now();
   $providerPolicy=$textVerified&&!empty($confirmed['authoritative'])&&in_array($confirmed['customer_refund_reason']??'', ['cancelled','timeout'],true)&&in_array($state,['cancelled','expired'],true);
   $customerPolicy=$acceptedCancel||$localTimeout||$providerPolicy;
   if($code===''&&$acceptedCancel)$state='cancelled';
   if($code===''&&$localTimeout)$state='expired';
   if(in_array($state,['cancelled','expired'],true)){
    if($code!==''||(!$customerPolicy&&(empty($confirmed['authoritative'])||empty($confirmed['no_sms_confirmed']))))fail('UNCONFIRMED_OUTCOME','The outcome requires provider confirmation.',409);
    $purchase=one('SELECT * FROM ledger WHERE user_id=? AND reference=?',[$o['user_id'],'purchase:'.$id]);
    if(in_array($o['status'],['pending','reconciliation'],true)&&!$purchase)Wallet::change($o['user_id'],'release',0,'release:'.$id,'Confirmed unprovisioned rental',-(int)$o['price_cents']);
    else{
     if(in_array($o['provider'],['textverified','5sim'],true)&&(!$purchase||(int)$purchase['amount_cents']>=0))fail('UNCONFIRMED_CHARGE','The original number charge could not be confirmed.',409);
     $amount=$purchase?-(int)$purchase['amount_cents']:(int)$o['price_cents'];
     $reason=$state==='expired'?'timeout':'cancelled';
     $credited=Wallet::change($o['user_id'],'refund',$amount,'refund:'.$id,'Full number refund: '.$reason);
     query('UPDATE orders SET customer_refund_cents=?,customer_refund_reason=?,customer_refunded_at=?,hidden_from_numbers=1 WHERE id=?',[$amount,$reason,now(),$id]);
     if($credited)audit('number_customer_refunded',$o['user_id'],['order'=>$id,'amount_cents'=>$amount,'reason'=>$reason,'policy'=>$customerPolicy?'boostlier':'provider_confirmed']);
    }
   }
   if(!empty($confirmed['cancel_requested'])&&$code==='')query('UPDATE orders SET hidden_from_numbers=1 WHERE id=?',[$id]);
   foreach($confirmed['messages']??[] as $message){if(!isset($message['id'],$message['body']))continue;if(!one('SELECT id FROM messages WHERE order_id=? AND provider_message_id=?',[$id,$message['id']]))query('INSERT INTO messages (id,order_id,provider_message_id,body,created_at) VALUES (?,?,?,?,?)',[id(),$id,$message['id'],$message['body'],now()]);}
   if(isset($confirmed['provider_state']))query('UPDATE orders SET provider_state=?,can_cancel=?,last_status_at=? WHERE id=?',[$confirmed['provider_state'],!empty($confirmed['can_cancel'])?1:0,now(),$id]);
   query('UPDATE orders SET status=?,sms_code=?,updated_at=? WHERE id=?',[$state,$code?:null,now(),$id]);if($state==='completed')RewardAccounting::completed($id);return self::public(one('SELECT * FROM orders WHERE id=?',[$id]));});
 }
 public static function sync(array $order,bool $cancel=false,?NumberProvider $adapterOverride=null):array {self::expireDue($order['user_id']);$order=one('SELECT * FROM orders WHERE id=?',[$order['id']]);if(in_array($order['status'],['completed','cancelled','expired'],true))return self::public($order);if(!$order['provider_order_id']){if(in_array($order['provider'],['textverified','5sim'],true)&&in_array($order['status'],['pending','reconciliation'],true)){require_once __DIR__.'/Reconciliation.php';return Reconciliation::run($order['id']);}return self::public($order);}if(!$cancel&&$order['provider']==='textverified'&&!empty($order['last_status_at'])&&strtotime($order['last_status_at'])>time()-8)return self::public($order);$p=$adapterOverride??provider($order['provider']);return self::settle($order['id'],$cancel?$p->cancel($order['provider_order_id']):$p->status($order['provider_order_id']));}
 public static function public(array $o):array {$metadata=json_decode($o['provider_metadata']??'{}',true)?:[];return ['id'=>$o['id'],'provider'=>$o['provider'],'product'=>$o['product'],'provider_order_id'=>$o['provider_order_id'],'service'=>$o['service'],'country'=>$o['country'],'country_code'=>$metadata['country_code']??null,'operator'=>$metadata['operator']??null,'success_rate'=>$metadata['success_rate']??null,'phone'=>$o['phone'],'sms_code'=>$o['sms_code'],'status'=>$o['status'],'price_usd'=>money((int)$o['price_cents']),'currency'=>'USD','expires_at'=>$o['expires_at']?str_replace(' ','T',$o['expires_at']).'Z':null,'created_at'=>str_replace(' ','T',$o['created_at']).'Z','provider_state'=>$o['provider_state']??null,'can_cancel'=>$o['product']==='long-term'?($o['status']==='active'&&!empty($o['rental_refundable'])&&!empty($o['expires_at'])&&$o['expires_at']>now()):!empty($o['can_cancel']),'hidden_from_numbers'=>!empty($o['hidden_from_numbers']),'refund_usd'=>!empty($o['customer_refund_cents'])?money((int)$o['customer_refund_cents']):null,'refund_reason'=>$o['customer_refund_reason']??null,'messages'=>all('SELECT body,created_at FROM messages WHERE order_id=? ORDER BY created_at LIMIT 20',[$o['id']])];}
}

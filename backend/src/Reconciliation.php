<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/RewardAccounting.php';
final class Reconciliation {
 public static function run(string $id):array {
  $order=one('SELECT * FROM orders WHERE id=?',[$id]);if($order&&in_array($order['product'],['usa','global'],true)){
   if(!in_array($order['status'],['pending','reconciliation'],true))return Rentals::public($order);
   $saved=one('SELECT receipt FROM provider_receipts WHERE intent_id=?',[$id]);$outcome=$saved?['authoritative'=>true,'outcome'=>'provisioned','receipt'=>json_decode($saved['receipt'],true)]:provider($order['provider'])->findIntent($id);
   if(empty($outcome['authoritative']))fail('UNCONFIRMED_OUTCOME','Provider lookup is not definitive.',409);
   if(($outcome['outcome']??'')==='not_provisioned')return Rentals::settle($id,['status'=>'cancelled','authoritative'=>true,'no_sms_confirmed'=>true]);
   if(($outcome['outcome']??'')!=='provisioned')fail('PROVISIONING_PENDING','The order remains pending.',409);$receipt=$outcome['receipt']??[];foreach(['id','phone','expires_at']as$key)if(empty($receipt[$key]))fail('UNCONFIRMED_OUTCOME','The verified receipt is incomplete.',409);
   tx(function()use($id,$receipt){$o=one('SELECT * FROM orders WHERE id=?'.lockSuffix(),[$id]);if(!in_array($o['status'],['pending','reconciliation'],true))return;RewardAccounting::receipt($id,$receipt);Wallet::change($o['user_id'],'purchase',-(int)$o['price_cents'],'purchase:'.$id,'Reconciled number rental',-(int)$o['price_cents']);query("UPDATE orders SET provider_order_id=?,phone=?,expires_at=?,status='active',updated_at=?,provider_metadata=?,can_cancel=?,provider_state=? WHERE id=?",[$receipt['id'],$receipt['phone'],$receipt['expires_at'],now(),json_encode($receipt),!empty($receipt['can_cancel'])?1:0,$receipt['provider_state']??null,$id]);audit('rental_reconciled',$o['user_id'],['order'=>$id]);});return Rentals::public(one('SELECT * FROM orders WHERE id=?',[$id]));
  }
  $i=one('SELECT * FROM fulfilment_intents WHERE id=?',[$id]);if(!$i)fail('NOT_FOUND','Intent not found.',404);if(!in_array($i['status'],['pending','reconciliation'],true))return Commerce::result($i);$outcome=$i['receipt']?['authoritative'=>true,'outcome'=>'provisioned','receipt'=>json_decode($i['receipt'],true)]:Commerce::adapter($i['product'])->findIntent($id);if(empty($outcome['authoritative']))fail('UNCONFIRMED_OUTCOME','The provider outcome is unconfirmed.',409);
  if(($outcome['outcome']??'')==='provisioned'){if(!$i['request_payload'])fail('RECONCILIATION_REQUIRED','The request payload requires operator review.',409);Commerce::activate($id,$outcome['receipt'],json_decode($i['request_payload'],true));}
  elseif(($outcome['outcome']??'')==='not_provisioned')tx(function()use($id){$i=one('SELECT * FROM fulfilment_intents WHERE id=?'.lockSuffix(),[$id]);if(!in_array($i['status'],['pending','reconciliation'],true))return;Wallet::change($i['user_id'],'release',0,'commerce-release:'.$id,'Provider confirmed no provisioning',-(int)$i['price_cents']);query("UPDATE fulfilment_intents SET status='cancelled',updated_at=? WHERE id=?",[now(),$id]);audit('fulfilment_released',$i['user_id'],['intent'=>$id]);});else fail('PROVISIONING_PENDING','The operation remains pending.',409);return Commerce::result(one('SELECT * FROM fulfilment_intents WHERE id=?',[$id]));
 }
}

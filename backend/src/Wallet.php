<?php
declare(strict_types=1);
namespace TempNumber;
final class Wallet {
 public static function balance(string $user):array {$r=one('SELECT * FROM wallets WHERE user_id=?',[$user]);if(!$r)fail('NOT_FOUND','Wallet not found.',404);return ['currency'=>'USD','balance_usd'=>money((int)$r['balance_cents']-(int)$r['reserved_cents']),'reserved_usd'=>money((int)$r['reserved_cents'])];}
 /** Caller must hold a transaction. All mutations lock the wallet before checking an operation reference. */
 public static function change(string $user,string $kind,int $amount,string $reference,string $description,int $reserveDelta=0):bool {
  $w=one('SELECT * FROM wallets WHERE user_id=?'.lockSuffix(),[$user]);if(!$w)fail('NOT_FOUND','Wallet not found.',404);
  if(one('SELECT id FROM ledger WHERE reference=?',[$reference]))return false;
  if($reserveDelta>0||($amount<0&&$reserveDelta===0&&in_array($kind,['purchase','renewal'],true))){$account=one('SELECT status FROM users WHERE id=?'.lockSuffix(),[$user]);if(!$account||$account['status']!=='active')fail('FORBIDDEN','This account is locked and cannot make transactions.',403);}
  $balance=(int)$w['balance_cents']+$amount;$reserved=(int)$w['reserved_cents']+$reserveDelta;
  if($reserved<0||$balance<0||$reserved>$balance)fail('INSUFFICIENT_FUNDS','Your wallet has insufficient available funds.');
  $updated=query('UPDATE wallets SET balance_cents=?,reserved_cents=? WHERE user_id=? AND balance_cents=? AND reserved_cents=?',[$balance,$reserved,$user,$w['balance_cents'],$w['reserved_cents']]);if($updated->rowCount()!==1 && ($amount!==0||$reserveDelta!==0))fail('WALLET_BUSY','Your wallet is being updated. Please retry.',409);
  query('INSERT INTO ledger (id,user_id,kind,amount_cents,balance_after_cents,reserved_after_cents,reference,description,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[id(),$user,$kind,$amount,$balance,$reserved,$reference,$description,now()]);return true;
 }
}

<?php
declare(strict_types=1);
namespace TempNumber;
final class Rewards {
 public static function period(?\DateTimeImmutable $now=null):array {
  $local=($now??new \DateTimeImmutable('now',new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('Europe/London'));
  $start=$local->modify('first day of this month')->setTime(0,0);$end=$start->modify('+1 month');
  return [$start->format('Y-m'),$start->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s'),$end->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s')];
 }
 private static function refunded(string $user,string $resource,string $product):bool {
  return (bool)one("SELECT id FROM ledger WHERE user_id=? AND kind='refund' AND amount_cents>0 AND reference IN (?,?,?)",[$user,'refund:'.$resource,'commerce-refund:'.$product.':'.$resource,'temp-mail-refund:'.$resource]);
 }
 /** Collect actual captured purchases once, with broader rules than rental cashback. */
 public static function qualifying(array $u):array {
  $events=[];
  foreach(all('SELECT * FROM orders WHERE user_id=?',[$u['id']])as$o){
   if(!in_array($o['product'],['usa','global'],true)||$o['status']!=='completed'||!empty($o['customer_refund_cents'])||self::refunded($u['id'],$o['id'],$o['product']))continue;
   $charge=one("SELECT amount_cents,created_at FROM ledger WHERE user_id=? AND reference=? AND amount_cents<0 AND kind='purchase'",[$u['id'],'purchase:'.$o['id']]);if(!$charge)continue;
   $events[]=['id'=>$o['id'],'amount'=>-(int)$charge['amount_cents'],'date'=>$o['created_at'],'paid_at'=>$charge['created_at'],'cashback'=>$o['price_tier']==='retail'];
  }
  foreach(all("SELECT * FROM fulfilment_intents WHERE user_id=? AND status='completed'",[$u['id']])as$i){
   $product=$i['product'];if(!in_array($product,['smm','long-term','dedicated','temp-mail'],true)||!$i['resource_id'])continue;
   $table=match($product){'smm'=>'smm_orders','temp-mail'=>'inboxes',default=>'orders'};
   $r=one('SELECT * FROM '.$table.' WHERE id=? AND user_id=?',[$i['resource_id'],$u['id']]);if(!$r)continue;
   $ok=match($product){'smm'=>in_array($r['status'],['completed','partial'],true),'long-term','dedicated'=>!in_array($r['status'],['cancelled','pending'],true),default=>!empty($r['address'])&&!empty($r['provider_id'])};
   if(!$ok||!empty($r['customer_refund_cents'])||!empty($r['cancelled_refund_cents'])||self::refunded($u['id'],$r['id'],$product))continue;
   $charge=one('SELECT amount_cents,created_at FROM ledger WHERE user_id=? AND reference=? AND amount_cents<0',[$u['id'],'commerce-capture:'.$i['id']]);if(!$charge)continue;
   $events[]=['id'=>$i['id'],'amount'=>-(int)$charge['amount_cents'],'date'=>$i['created_at'],'paid_at'=>$charge['created_at'],'cashback'=>false];
  }
  foreach(all("SELECT * FROM temp_mail_operations WHERE user_id=? AND status='completed'",[$u['id']])as$i){
   $inbox=one('SELECT address,provider_id FROM inboxes WHERE id=? AND user_id=?',[$i['inbox_id'],$u['id']]);if(!$inbox||!$inbox['address']||!$inbox['provider_id']||self::refunded($u['id'],$i['inbox_id'],'temp-mail'))continue;
   $reference=($i['operation']==='renew'?'temp-mail-renew:':'temp-mail-capture:').$i['id'];
   $charge=one('SELECT amount_cents,created_at FROM ledger WHERE user_id=? AND reference=? AND amount_cents<0',[$u['id'],$reference]);if(!$charge)continue;
   $events[]=['id'=>$i['id'],'amount'=>-(int)$charge['amount_cents'],'date'=>$i['created_at'],'paid_at'=>$charge['created_at'],'cashback'=>false];
  }
  return $events;
 }
 private static function streak(array $days,array $claims,\DateTimeImmutable $clock):array {
  $used='';foreach($claims as$c)if($c['reward']==='streak'){
   $parts=explode(':',$c['period']);$end=count($parts)===3&&$parts[0]==='streak'?$parts[2]:(new \DateTimeImmutable($c['created_at'],new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('Europe/London'))->format('Y-m-d');$used=max($used,$end);
  }
  $days=array_values(array_filter(array_keys($days),fn($d)=>$d>$used));sort($days);$run=[];
  foreach($days as$day){if($run&&(new \DateTimeImmutable(end($run),new \DateTimeZone('Europe/London')))->modify('+1 day')->format('Y-m-d')!==$day)$run=[];$run[]=$day;if(count($run)===7)return ['progress'=>7,'period'=>'streak:'.$run[0].':'.$day];}
  $today=$clock->setTimezone(new \DateTimeZone('Europe/London'))->format('Y-m-d');$yesterday=$clock->setTimezone(new \DateTimeZone('Europe/London'))->modify('-1 day')->format('Y-m-d');
  if(!$run||!in_array(end($run),[$today,$yesterday],true))$run=[];
  return ['progress'=>count($run),'period'=>null];
 }
 public static function progress(array $u,?\DateTimeImmutable $clock=null):array {
  $clock=$clock??new \DateTimeImmutable('now',new \DateTimeZone('UTC'));$cutoff=$clock->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
  $config=Pricing::setting('rewards_v3');$enabled=!empty($config['enabled']);$launch=$config['topup_launch_date']??null;
  $launchDate=is_string($launch)?\DateTimeImmutable::createFromFormat('!Y-m-d',$launch,new \DateTimeZone('Europe/London')):false;$validLaunch=$launchDate&&$launchDate->format('Y-m-d')===$launch;
  [$period,$start,$end]=self::period($clock);$claims=all('SELECT reward,period,amount_cents,created_at FROM reward_claims WHERE user_id=? ORDER BY created_at DESC,id DESC',[$u['id']]);
  $claimed=[];$totals=[];foreach($claims as$c){$claimed[$c['reward'].':'.$c['period']]=true;$totals[$c['reward']]=($totals[$c['reward']]??0)+(int)$c['amount_cents'];}
  $events=self::qualifying($u);$spend=0;$cashSpend=0;$days=[];
  foreach($events as$e){if($e['date']>$cutoff||$e['paid_at']>$cutoff)continue;if($e['paid_at']>=$start&&$e['paid_at']<$end)$spend+=$e['amount'];if($e['cashback'])$cashSpend+=$e['amount'];$days[(new \DateTimeImmutable($e['date'],new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('Europe/London'))->format('Y-m-d')]=true;}
  $streak=self::streak($days,$claims,$clock);$cash=max(0,intdiv($cashSpend,100)-($totals['cashback']??0));
  $bonusEarned=0;$deposits=0;
  if($validLaunch){$launchUtc=(new \DateTimeImmutable($launch.' 00:00:00',new \DateTimeZone('Europe/London')))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
   foreach(all("SELECT p.amount_cents,l.created_at FROM payments p JOIN ledger l ON l.user_id=p.user_id AND l.reference=".(db()->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?"CONCAT('topup:',p.id)":"('topup:' || p.id)")." WHERE p.user_id=? AND p.status='successful' AND p.currency='USD' AND p.amount_cents>=5000 AND l.kind='topup' AND l.amount_cents=p.amount_cents AND l.created_at>=? AND l.created_at<=?",[$u['id'],$launchUtc,$cutoff])as$p){$bonusEarned+=intdiv((int)$p['amount_cents']*5,100);$deposits++;}
  }
  $bonus=max(0,$bonusEarned-($totals['topup_bonus']??0));$friends=all('SELECT id FROM users WHERE referred_by=? AND id<>?',[$u['id'],$u['id']]);$qualified=0;
  foreach($friends as$f){foreach(self::qualifying($f)as$e)if($e['date']<=$cutoff&&$e['paid_at']<=$cutoff){$qualified++;break;}}
  $milestones=[];$refAmount=0;$unclaimed=[];foreach([5=>25,10=>75,25=>250,50=>600]as$n=>$amount){$wasClaimed=isset($claimed['referral:milestone:'.$n]);$unlocked=$qualified>=$n;if($unlocked&&!$wasClaimed){$refAmount+=$amount;$unclaimed[]=$n;}$milestones[]=['count'=>$n,'amount_usd'=>money($amount),'unlocked'=>$unlocked,'claimed'=>$wasClaimed];}
  $monthlyClaimed=isset($claimed['monthly_spend:'.$period]);$rewards=[
   ['id'=>'monthly_spend','progress'=>$spend,'threshold'=>2500,'amount_usd'=>'1.00','eligible'=>$enabled&&$spend>=2500&&!$monthlyClaimed,'claimed'=>$monthlyClaimed,'period'=>$period],
   ['id'=>'streak','progress'=>$streak['progress'],'threshold'=>7,'amount_usd'=>'0.50','eligible'=>$enabled&&$streak['period']!==null,'claimed'=>false,'period'=>$streak['period']],
   ['id'=>'cashback','progress'=>$cash,'threshold'=>50,'amount_usd'=>money($cash),'eligible'=>$enabled&&$cash>=50,'claimed'=>false,'period'=>null],
   ['id'=>'topup_bonus','progress'=>$bonus,'threshold'=>1,'amount_usd'=>money($bonus),'eligible'=>$enabled&&$validLaunch&&$bonus>0,'claimed'=>false,'period'=>null],
   ['id'=>'referral','progress'=>$qualified,'threshold'=>$qualified<5?5:($qualified<10?10:($qualified<25?25:50)),'amount_usd'=>money($refAmount),'eligible'=>$enabled&&$refAmount>0,'claimed'=>count($unclaimed)===0&&$qualified>=50,'period'=>null]
  ];
  foreach($rewards as&$r)$r['claimed_usd']=money($totals[$r['id']]??0);unset($r);
  return ['commercial_state'=>$enabled?'configured':'disabled','referral_code'=>$u['referral_code'],'referral_link'=>rtrim(env('APP_URL','http://localhost:3000'),'/').'/auth/signup?ref='.rawurlencode($u['referral_code']),'period'=>$period,'rewards'=>$rewards,'referrals'=>['total'=>count($friends),'qualified'=>$qualified],'milestones'=>$milestones,'unclaimed_milestones'=>$unclaimed,'topup_launch_date'=>$validLaunch?$launch:null,'qualifying_deposits'=>$deposits,'claims'=>array_map(fn($c)=>['reward'=>$c['reward'],'period'=>$c['period'],'amount_usd'=>money((int)$c['amount_cents']),'created_at'=>str_replace(' ','T',$c['created_at']).'Z'],array_slice($claims,0,100))];
 }
 public static function claim(array $u,string $reward):array {return tx(function()use($u,$reward){
  one('SELECT user_id FROM wallets WHERE user_id=?'.lockSuffix(),[$u['id']]);$account=one('SELECT * FROM users WHERE id=?'.lockSuffix(),[$u['id']]);if(!$account||$account['status']!=='active')fail('FORBIDDEN','This account cannot claim rewards.',403);
  $p=self::progress($account);if($p['commercial_state']!=='configured')fail('REWARDS_UNCONFIGURED','Rewards are currently paused.',503);$r=null;foreach($p['rewards']as$item)if($item['id']===$reward)$r=$item;
  if(!$r||!$r['eligible'])fail('REWARD_INELIGIBLE','This reward is not available to claim.');$amount=cents($r['amount_usd']);$batch=id();$periods=$reward==='referral'?array_map(fn($n)=>'milestone:'.$n,$p['unclaimed_milestones']):[$r['period']??'incremental:'.$batch];
  foreach($periods as$period){$part=$amount;if($reward==='referral'){foreach($p['milestones']as$m)if('milestone:'.$m['count']===$period)$part=cents($m['amount_usd']);}query('INSERT INTO reward_claims (id,user_id,reward,period,amount_cents,created_at) VALUES (?,?,?,?,?,?)',[id(),$u['id'],$reward,$period,$part,now()]);}
  Wallet::change($u['id'],'bonus',$amount,'reward:'.$batch,'Reward: '.$reward);audit('reward_claimed',$u['id'],['reward'=>$reward,'amount_cents'=>$amount,'periods'=>$periods,'batch'=>$batch]);
  return ['message'=>money($amount).' USD credited to your wallet.','amount_usd'=>money($amount)];
 });}
}

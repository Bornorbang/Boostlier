<?php
declare(strict_types=1);
namespace TempNumber;

final class AccountMail {
 public static function enqueue(string $uid,string $kind,?string $ticket=null):string {
  if(!in_array($kind,['welcome','reset','support'],true)||($kind==='support'&&!$ticket))throw new \InvalidArgumentException('Unknown account email');
  $id=id();
  query('INSERT INTO transactional_mail (id,user_id,kind,available_at,created_at,expires_at,support_ticket_id) VALUES (?,?,?,?,?,?,?)',[$id,$uid,$kind,now(),now(),gmdate('Y-m-d H:i:s',time()+($kind==='support'?604800:($kind==='reset'?1800:86400))),$ticket]);
  return $id;
 }
 public static function reset(string $password,string $token):void {
  if(strlen($password)<12||mb_strlen($password)>200)fail('WEAK_PASSWORD','Use between 12 and 200 characters.');
  if(!preg_match('/^[a-f0-9]{64}$/D',$token))fail('INVALID_TOKEN','This reset link is invalid or expired. Request a new link.');
  tx(function()use($password,$token){
   // Lock the owner first: separate reset links for one account cannot race.
   $candidate=one('SELECT user_id FROM reset_tokens WHERE token_hash=?',[hash('sha256',$token)]);
   if(!$candidate)fail('INVALID_TOKEN','This reset link is invalid or expired. Request a new link.');
   $u=one('SELECT * FROM users WHERE id=?'.lockSuffix(),[$candidate['user_id']]);
   $r=one('SELECT * FROM reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?'.lockSuffix(),[hash('sha256',$token),now()]);
   if(!$r||!$u||$u['status']!=='active')fail('INVALID_TOKEN','This reset link is invalid or expired. Request a new link.');
   query('UPDATE users SET password_hash=? WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$u['id']]);
   query('UPDATE reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL',[now(),$u['id']]);
   query('DELETE FROM sessions WHERE user_id=?',[$u['id']]);
   query("UPDATE transactional_mail SET status='cancelled' WHERE user_id=? AND kind='reset' AND status IN ('pending','sending')",[$u['id']]);
   audit('password_reset',$u['id']);
  });
 }
 public static function deliver(?string $only=null,int $limit=10,?callable $transport=null):array {
  $summary=['sent'=>0,'deferred'=>0];
  if(!$transport&&(!env('SMTP_HOST')||!env('SMTP_FROM')))return $summary;
  query("UPDATE transactional_mail SET status='expired' WHERE status IN ('pending','sending') AND expires_at<=?",[now()]);
  $rows=all("SELECT id FROM transactional_mail WHERE (status='pending' OR (status='sending' AND lease_until<?)) AND available_at<=? AND expires_at>?".($only?' AND id=?':'').' ORDER BY created_at LIMIT '.max(1,min(50,$limit)),$only?[now(),now(),now(),$only]:[now(),now(),now()]);
  foreach($rows as$row){
   $job=tx(function()use($row){
    $q=one('SELECT * FROM transactional_mail WHERE id=?'.lockSuffix(),[$row['id']]);
    if(!$q||$q['expires_at']<=now()||!($q['status']==='pending'||($q['status']==='sending'&&$q['lease_until']<now())))return null;
    $u=one('SELECT * FROM users WHERE id=?'.lockSuffix(),[$q['user_id']]);
    if(!$u||($q['kind']!=='support'&&$u['status']!=='active')){query("UPDATE transactional_mail SET status='cancelled' WHERE id=?",[$q['id']]);return null;}
    $token=null;
    if($q['kind']==='reset'){
     $token=bin2hex(random_bytes(32));
     query('UPDATE reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL',[now(),$u['id']]);
     query('INSERT INTO reset_tokens (token_hash,user_id,expires_at) VALUES (?,?,?)',[hash('sha256',$token),$u['id'],gmdate('Y-m-d H:i:s',time()+1800)]);
    }
    query("UPDATE transactional_mail SET status='sending',attempts=attempts+1,lease_until=? WHERE id=?",[gmdate('Y-m-d H:i:s',time()+120),$q['id']]);
    return [$q,$u,$token];
   });
   if(!$job)continue;
   [$q,$u,$token]=$job;
   try{
    $to=$u['email'];$replyTo='';$attachments=[];
    if($q['kind']==='support'){
     require_once __DIR__.'/SupportRequests.php';
     $ticket=one('SELECT * FROM support_tickets WHERE id=? AND user_id=?',[$q['support_ticket_id'],$u['id']]);
     if(!$ticket)throw new \RuntimeException('Support ticket not found');
     [$subject,$text,$html]=SupportRequests::email($u,$ticket);$to=env('SUPPORT_EMAIL','support@boostlier.com')?:'support@boostlier.com';$replyTo=$u['email'];
     if($ticket['attachment']!==''){
      $filename=basename($ticket['attachment']);$file=__DIR__.'/../storage/'.$filename;
      if(!is_file($file))throw new \RuntimeException('Support receipt missing');
      $attachments[]=['path'=>$file,'name'=>'payment-receipt.'.pathinfo($filename,PATHINFO_EXTENSION)];
     }
    }else [$subject,$text,$html]=self::message($u,$q['kind'],$token);
    ($transport??__NAMESPACE__.'\\sendMail')($to,$subject,$text,$html,$replyTo,$attachments);
    query("UPDATE transactional_mail SET status='sent',sent_at=?,lease_until=NULL WHERE id=? AND status='sending'",[now(),$q['id']]);
    if($q['kind']==='support')query("UPDATE support_tickets SET status='submitted' WHERE id=? AND status='pending_email'",[$q['support_ticket_id']]);
    $summary['sent']++;
   }catch(\Throwable){
    // Keep provider errors and reset secrets out of logs and public responses.
    query("UPDATE transactional_mail SET status='pending',available_at=?,lease_until=NULL WHERE id=? AND status='sending'",[gmdate('Y-m-d H:i:s',time()+min(3600,30*(2**min(6,(int)$q['attempts'])))),$q['id']]);$summary['deferred']++;
   }
  }
  return $summary;
 }
 public static function message(array $u,string $kind,?string $token=null):array {
  $base=rtrim(env('APP_URL'),'/');
  if(!filter_var($base,FILTER_VALIDATE_URL)||!in_array(parse_url($base,PHP_URL_SCHEME),['http','https'],true))throw new \RuntimeException('Configure APP_URL');
  $reset=$kind==='reset';$subject=$reset?'Reset your Boostlier password':'Welcome to Boostlier';
  $url=$base.($reset?'/auth/reset-password?token='.rawurlencode((string)$token):'/dashboard');
  $intro=$reset?'We received a request to reset your password. This link expires in 30 minutes and can be used once.':'Your Boostlier account is ready. Explore social promotion, numbers and SMS, long-term rentals, and temporary email from your dashboard.';
  $note=$reset?'If you did not request this, ignore this email. Your password stays unchanged.':'You can sign in with the email address you used to register. Need help? Contact support@boostlier.com.';
  $label=$reset?'Reset password':'Open your dashboard';$name=$u['name'];
  $text="Hello $name,\n\n$intro\n\n$label: $url\n\n$note\n\nBoostlier\nsupport@boostlier.com";
  $escape=fn(string $v)=>htmlspecialchars($v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
  $html='<html><body style="margin:0;background:#f5f7f5;font-family:Arial,sans-serif;color:#18211a"><div style="max-width:560px;margin:32px auto;padding:32px;background:white;border-radius:16px"><h1 style="font-size:24px">'.$escape($subject).'</h1><p>Hello '.$escape($name).',</p><p style="line-height:1.7">'.$escape($intro).'</p><p style="margin:28px 0"><a style="display:inline-block;background:#b5ed65;color:#14200e;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold" href="'.$escape($url).'">'.$label.'</a></p><p style="font-size:13px;line-height:1.6">'.$escape($note).'</p><p style="font-size:12px;word-break:break-all">Button not working? '.$escape($url).'</p></div></body></html>';
  return [$subject,$text,$html];
 }
}

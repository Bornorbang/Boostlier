<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:');putenv('APP_ENV=testing');putenv('APP_URL=http://localhost:3000');putenv('SMTP_HOST=');
require __DIR__.'/../src/bootstrap.php';require __DIR__.'/../src/AccountMail.php';
foreach(glob(__DIR__.'/../migrations/*.sql')as$file)db()->exec(file_get_contents($file));
$uid=id();query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$uid,'<Customer>','mail@example.invalid',password_hash('original-password',PASSWORD_DEFAULT),id(),now()]);
$u=one('SELECT * FROM users WHERE id=?',[$uid]);$passed=0;
function test(string $name,callable $fn):void{global$passed;$fn();$passed++;echo "PASS $name\n";}
function eq(mixed$a,mixed$b):void{if($a!==$b)throw new \RuntimeException(var_export($a,true).' !== '.var_export($b,true));}
function rejects(callable$fn,string$code):void{try{$fn();}catch(Problem$e){eq($e->key,$code);return;}throw new \RuntimeException('Expected '.$code);}
$sent=[];$transport=function($to,$subject,$text,$html)use(&$sent){$sent[]=compact('to','subject','text','html');};
test('Welcome enqueue rolls back with failed registration',function()use($uid){try{tx(function()use($uid){AccountMail::enqueue($uid,'welcome');throw new \RuntimeException('rollback');});}catch(\RuntimeException){}eq(count(all('SELECT * FROM transactional_mail')),0);});
$welcome=AccountMail::enqueue($uid,'welcome');
test('Missing SMTP leaves email queued',function()use($welcome){eq(AccountMail::deliver($welcome)['sent'],0);eq(one('SELECT status FROM transactional_mail WHERE id=?',[$welcome])['status'],'pending');});
test('Welcome contains safe HTML, dashboard link, and plain text',function()use($welcome,$transport,&$sent){eq(AccountMail::deliver($welcome,1,$transport)['sent'],1);eq(str_contains($sent[0]['html'],'&lt;Customer&gt;'),true);eq(str_contains($sent[0]['text'],'http://localhost:3000/dashboard'),true);eq(str_contains($sent[0]['text'],'original-password'),false);});
test('Sent welcome is not sent again',function()use($welcome,$transport,&$sent){AccountMail::deliver($welcome,1,$transport);eq(count($sent),1);});
$reset=AccountMail::enqueue($uid,'reset');
test('SMTP failure is deferred without plaintext token storage',function()use($reset){eq(AccountMail::deliver($reset,1,function(){throw new \RuntimeException('secret provider error');})['deferred'],1);$row=one('SELECT * FROM transactional_mail WHERE id=?',[$reset]);eq($row['status'],'pending');eq((int)$row['attempts'],1);eq(str_contains(json_encode($row),'secret provider error'),false);eq(count(all('SELECT * FROM reset_tokens')),1);});
$token='';
test('Retry generates a fresh single-use thirty-minute reset token',function()use($reset,$transport,&$sent,&$token){query('UPDATE transactional_mail SET available_at=? WHERE id=?',[now(),$reset]);AccountMail::deliver($reset,1,$transport);preg_match('/token=([a-f0-9]{64})/',$sent[1]['text'],$m);$token=$m[1];$r=one('SELECT * FROM reset_tokens WHERE token_hash=?',[hash('sha256',$token)]);eq($r['used_at'],null);eq(strtotime($r['expires_at'])-time()<=1800,true);eq((int)one('SELECT COUNT(*) n FROM reset_tokens WHERE used_at IS NULL')['n'],1);eq(str_contains(json_encode(all('SELECT * FROM transactional_mail')),$token),false);});
test('Short passwords and malformed tokens fail',function()use(&$token){rejects(fn()=>AccountMail::reset('short',$token),'WEAK_PASSWORD');rejects(fn()=>AccountMail::reset('new-long-password','wrong'),'INVALID_TOKEN');});
test('Expired tokens cannot reset passwords',function()use($uid){$t=bin2hex(random_bytes(32));query('INSERT INTO reset_tokens (token_hash,user_id,expires_at) VALUES (?,?,?)',[hash('sha256',$t),$uid,gmdate('Y-m-d H:i:s',time()-1)]);rejects(fn()=>AccountMail::reset('new-long-password',$t),'INVALID_TOKEN');});
$pending=AccountMail::enqueue($uid,'reset');
test('Successful reset changes password, revokes sessions, cancels queued links, audits',function()use($uid,&$token,$pending){query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',[hash('sha256','session'),$uid,gmdate('Y-m-d H:i:s',time()+1000)]);AccountMail::reset('new-long-password',$token);eq(password_verify('new-long-password',one('SELECT password_hash FROM users WHERE id=?',[$uid])['password_hash']),true);eq(count(all('SELECT * FROM sessions')),0);eq(one('SELECT status FROM transactional_mail WHERE id=?',[$pending])['status'],'cancelled');eq((int)one("SELECT COUNT(*) n FROM audit_log WHERE action='password_reset'")['n'],1);});
test('Consumed token cannot be replayed',function()use(&$token){rejects(fn()=>AccountMail::reset('different-password',$token),'INVALID_TOKEN');});
test('Disabled accounts receive no email',function()use($uid,$transport){query("UPDATE users SET status='disabled' WHERE id=?",[$uid]);$id=AccountMail::enqueue($uid,'reset');AccountMail::deliver($id,1,$transport);eq(one('SELECT status FROM transactional_mail WHERE id=?',[$id])['status'],'cancelled');});
test('Expired queued reset is not delivered',function()use($uid,$transport){$id=AccountMail::enqueue($uid,'reset');query('UPDATE transactional_mail SET expires_at=? WHERE id=?',[gmdate('Y-m-d H:i:s',time()-1),$id]);eq(AccountMail::deliver($id,1,$transport)['sent'],0);eq(one('SELECT status FROM transactional_mail WHERE id=?',[$id])['status'],'expired');});
echo "$passed account mail tests passed\n";

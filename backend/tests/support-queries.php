<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:');putenv('APP_ENV=testing');putenv('SMTP_HOST=');putenv('SUPPORT_EMAIL=support@boostlier.com');
require __DIR__.'/../src/bootstrap.php';require __DIR__.'/../src/SupportRequests.php';
foreach(glob(__DIR__.'/../migrations/*.sql')as$f)db()->exec(file_get_contents($f));
$uid=id();query('INSERT INTO users (id,name,email,password_hash,referral_code,created_at) VALUES (?,?,?,?,?,?)',[$uid,'Support QA','support-qa@example.invalid','unused',id(),now()]);query('INSERT INTO wallets (user_id) VALUES (?)',[$uid]);$u=one('SELECT * FROM users WHERE id=?',[$uid]);$passed=0;
function test(string$n,callable$f):void{global$passed;$f();$passed++;echo "PASS $n\n";}
function eq(mixed$a,mixed$b):void{if($a!==$b)throw new \RuntimeException(var_export($a,true).' !== '.var_export($b,true));}
function rejects(callable$f,string$code):void{try{$f();}catch(Problem$e){eq($e->key,$code);return;}throw new \RuntimeException('Expected '.$code);}
$b=['issue_type'=>'sms','description'=>'I have not received a code for this test number.','reference'=>'+12025550123'];
test('Allowed issue and description validation enforced',function()use($u,$b){rejects(fn()=>SupportRequests::submit($u,array_replace($b,['issue_type'=>'arbitrary']),'support-key-1'),'INVALID_ISSUE');rejects(fn()=>SupportRequests::submit($u,array_replace($b,['description'=>'short']),'support-key-1'),'VALIDATION_ERROR');rejects(fn()=>SupportRequests::submit($u,$b,''),'IDEMPOTENCY_REQUIRED');});
test('Disabled account cannot submit',fn()=>rejects(fn()=>SupportRequests::submit(array_replace($u,['status'=>'disabled']),$b,'support-key-1'),'FORBIDDEN'));
$ticket=null;
test('Submission atomically saves ticket, owner, queue and audit without receipt',function()use($u,$b,&$ticket){$ticket=SupportRequests::submit($u,$b,'support-key-1');$r=one('SELECT * FROM support_tickets WHERE id=?',[$ticket['id']]);eq($r['user_id'],$u['id']);eq($r['attachment'],'');eq($r['status'],'pending_email');eq((int)one('SELECT COUNT(*) n FROM transactional_mail WHERE support_ticket_id=?',[$ticket['id']])['n'],1);eq((int)one("SELECT COUNT(*) n FROM audit_log WHERE action='support_submitted'")['n'],1);});
test('Retry returns same ticket and does not create duplicate email',function()use($u,$b,$ticket){eq(SupportRequests::submit($u,$b,'support-key-1')['id'],$ticket['id']);eq((int)one('SELECT COUNT(*) n FROM transactional_mail')['n'],1);rejects(fn()=>SupportRequests::submit($u,array_replace($b,['description'=>'Different request with the same key.']),'support-key-1'),'IDEMPOTENCY_CONFLICT');});
test('New submissions respect cooldown',fn()=>rejects(fn()=>SupportRequests::submit($u,$b,'support-key-2'),'SUPPORT_COOLDOWN'));
$mail=one('SELECT * FROM transactional_mail WHERE support_ticket_id=?',[$ticket['id']]);
test('Provider errors retain query and schedule retry',function()use($mail,$ticket){eq(AccountMail::deliver($mail['id'],1,function(){throw new \RuntimeException('SMTP unavailable');})['deferred'],1);eq(one('SELECT status FROM support_tickets WHERE id=?',[$ticket['id']])['status'],'pending_email');});
test('Delivery goes to support with customer reply-to and context',function()use($mail,$ticket,$u){query('UPDATE transactional_mail SET available_at=? WHERE id=?',[now(),$mail['id']]);$sent=[];$r=AccountMail::deliver($mail['id'],1,function($to,$subject,$text,$html,$replyTo)use(&$sent){$sent=compact('to','subject','text','html','replyTo');});eq($r['sent'],1);eq($sent['to'],'support@boostlier.com');eq($sent['replyTo'],$u['email']);eq(str_contains($sent['text'],'+12025550123'),true);eq(str_contains($sent['text'],$u['email']),true);eq(one('SELECT status FROM support_tickets WHERE id=?',[$ticket['id']])['status'],'submitted');});
test('Sent support email is not resent on retry',function()use($mail){eq(AccountMail::deliver($mail['id'],1,function(){throw new \RuntimeException('Must not send');})['sent'],0);});
test('Support HTML escapes customer input',function()use($u){$ticket=['id'=>id(),'issue_type'=>'Account enquiry','payment_reference'=>'<script>','created_at'=>now(),'description'=>'<img src=x onerror=alert(1)>'];$message=SupportRequests::email($u,$ticket);eq(str_contains($message[2],'<img src=x'),false);eq(str_contains($message[2],'&lt;img'),true);});
test('Optional reference and all service categories accepted',function()use($u){foreach(array_keys(SupportRequests::ISSUES)as$type){query('UPDATE support_tickets SET created_at=?',[gmdate('Y-m-d H:i:s',time()-1000)]);$r=SupportRequests::submit($u,['issue_type'=>$type,'description'=>'Test support request for the selected service.'],id());eq(one('SELECT payment_reference FROM support_tickets WHERE id=?',[$r['id']])['payment_reference'],'');}});
echo "$passed support query tests passed\n";

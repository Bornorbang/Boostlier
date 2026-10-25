<?php
declare(strict_types=1);
namespace TempNumber;
putenv('DB_DSN=sqlite::memory:');putenv('APP_ENV=testing');
require __DIR__.'/../src/bootstrap.php';require __DIR__.'/../src/DashboardNotice.php';
foreach(glob(__DIR__.'/../migrations/*.sql')as$file)db()->exec(file_get_contents($file));
$uid=id();query('INSERT INTO users (id,name,email,password_hash,role,referral_code,created_at) VALUES (?,?,?,?,?,?,?)',[$uid,'Notice admin','notice@example.invalid','unused','admin',id(),now()]);
$a=['id'=>$uid,'role'=>'admin','status'=>'active'];$passed=0;
function test(string $name,callable $fn):void{global$passed;$fn();$passed++;echo "PASS $name\n";}
function eq(mixed$a,mixed$b):void{if($a!==$b)throw new \RuntimeException(var_export($a,true).' !== '.var_export($b,true));}
function rejects(callable$fn,string$code):void{try{$fn();}catch(Problem$e){eq($e->key,$code);return;}throw new \RuntimeException('Expected '.$code);}
test('No configured notice is blank',fn()=>eq(DashboardNotice::read()['text'],''));
test('Only active non-impersonating administrators can save',function()use($a){foreach([array_replace($a,['role'=>'customer']),array_replace($a,['status'=>'disabled']),array_replace($a,['impersonator_id'=>'other-admin'])]as$u)rejects(fn()=>DashboardNotice::save($u,['text'=>'bad']),'FORBIDDEN');eq(DashboardNotice::read()['text'],'');});
test('Save persists one normalized plain-text setting and audit',function()use($a){eq(DashboardNotice::save($a,['text'=>"  Hello\nworld  "])['text'],'Hello world');eq(DashboardNotice::read()['text'],'Hello world');eq((int)one("SELECT COUNT(*) n FROM audit_log WHERE action='dashboard_notice_updated'")['n'],1);});
test('Markup remains plain text for safe text rendering',fn()=>eq(DashboardNotice::save($a,['text'=>'<script>alert(1)</script>'])['text'],'<script>alert(1)</script>'));
test('Invalid or overlong text cannot overwrite current notice',function()use($a){foreach([null,[],true,str_repeat('a',1001)]as$text)rejects(fn()=>DashboardNotice::save($a,['text'=>$text]),'VALIDATION_ERROR');eq(DashboardNotice::read()['text'],'<script>alert(1)</script>');});
test('Unicode character limit is not a byte limit',fn()=>eq(mb_strlen(DashboardNotice::save($a,['text'=>str_repeat("\u{1F600}",1000)])['text']),1000));
test('Empty text clears notice without duplicate settings',function()use($a){eq(DashboardNotice::save($a,['text'=>'   '])['text'],'');eq((int)one("SELECT COUNT(*) n FROM settings WHERE name='dashboard_notice'")['n'],1);});
echo "$passed dashboard notice tests passed\n";

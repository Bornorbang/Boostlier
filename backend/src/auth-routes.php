<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/Impersonation.php';
require_once __DIR__.'/AccountMail.php';
if($path==='/auth/impersonation'&&$method==='GET')json(Impersonation::context());
if($path==='/auth/impersonation/stop'&&$method==='POST')json(Impersonation::stop());
if($path==='/auth/me'&&$method==='GET')json(['user'=>safeUser(user())]);
if($path==='/auth/logout'&&$method==='POST'){Impersonation::logout();query('DELETE FROM sessions WHERE token_hash=?',[hash('sha256',$_COOKIE['tn_session']??'')]);setcookie('tn_session','',['expires'=>time()-3600,'path'=>'/','secure'=>env('APP_ENV')==='production','httponly'=>true,'samesite'=>'Lax']);json(['message'=>'Signed out.']);}
if($method==='POST'&&in_array($path,['/auth/signin','/auth/signup','/auth/forgot-password','/auth/reset-password'],true)){
 rateLimit('auth:'.($_SERVER['REMOTE_ADDR']??'local'),20,300);$b=body();
 if($path==='/auth/signup'){$email=strtolower(required($b,'email',254));if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail('INVALID_EMAIL','Enter a valid email address.');$name=required($b,'name',120);$password=required($b,'password',200);if(strlen($password)<12)fail('WEAK_PASSWORD','Use at least 12 characters.');if(one('SELECT id FROM users WHERE email=?',[$email]))fail('ACCOUNT_EXISTS','An account already uses this email address.');$ref=strtoupper(trim((string)($b['referral_code']??'')));$referrer=$ref!==''?one('SELECT id FROM users WHERE UPPER(referral_code)=?',[$ref]):null;if($ref!==''&&!$referrer)fail('INVALID_REFERRAL','That referral code was not found.');$uid=id();tx(function()use($uid,$name,$email,$password,$referrer){query('INSERT INTO users (id,name,email,password_hash,referral_code,referred_by,created_at) VALUES (?,?,?,?,?,?,?)',[$uid,$name,$email,password_hash($password,PASSWORD_DEFAULT),strtoupper(substr(id(),0,10)),$referrer['id']??null,now()]);query('INSERT INTO wallets (user_id) VALUES (?)',[$uid]);AccountMail::enqueue($uid,'welcome');});$u=one('SELECT * FROM users WHERE id=?',[$uid]);session($u);json(['user'=>safeUser($u)],201);}
 if($path==='/auth/signin'){$email=strtolower(required($b,'email',254));rateLimit('login:'.hash('sha256',$email),10,300);$u=one('SELECT * FROM users WHERE email=?',[$email]);if(!$u||!password_verify(required($b,'password',200),$u['password_hash']))fail('INVALID_CREDENTIALS','Email or password is incorrect.',401);if($u['status']!=='active')fail('FORBIDDEN','This account is disabled.',403);session($u);json(['user'=>safeUser($u)]);}
 if($path==='/auth/forgot-password'){
  $email=strtolower(required($b,'email',254));if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail('INVALID_EMAIL','Enter a valid email address.');
  rateLimit('reset:'.hash('sha256',$email),3,3600);
  $u=one("SELECT * FROM users WHERE email=? AND status='active'",[$email]);
  if($u)AccountMail::enqueue($u['id'],'reset');
  json(['message'=>'A password reset link has been sent. Please check your inbox and spam folder.']);
 }
 if($path==='/auth/reset-password'){AccountMail::reset(required($b,'password',200),required($b,'token',100));json(['message'=>'Password reset. You can now sign in.']);}
}
if(str_starts_with($path,'/auth/google/')&&$method==='GET'){require __DIR__.'/GoogleAuth.php';if($path==='/auth/google/start')GoogleAuth::start();if($path==='/auth/google/callback')GoogleAuth::callback();}

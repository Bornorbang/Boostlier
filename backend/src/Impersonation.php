<?php
declare(strict_types=1);
namespace TempNumber;

final class Impersonation
{
    private static function cookie(string $name, string $value, int $expires): void
    {
        setcookie($name,$value,['expires'=>$expires,'path'=>'/','secure'=>env('APP_ENV')==='production','httponly'=>true,'samesite'=>'Lax']);
    }
    public static function start(array $actor, string $id): array
    {
        if (($actor['role']??'')!=='admin' || ($actor['status']??'')!=='active' || !empty($actor['impersonator_id'])) fail('FORBIDDEN','Administrator access is required.',403);
        $original = $_COOKIE['tn_session']??''; $hash=hash('sha256',$original); $token=bin2hex(random_bytes(32));
        $target=tx(function()use($actor,$id,$hash,$token){
            $parent=one("SELECT s.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND s.impersonator_id IS NULL AND u.role='admin' AND u.status='active'".lockSuffix(),[$hash,$actor['id'],now()]);
            if(!$parent)fail('UNAUTHENTICATED','Sign in again as an administrator.',401);
            $target=one('SELECT * FROM users WHERE id=?'.lockSuffix(),[$id]);
            if(!$target)fail('NOT_FOUND','Customer not found.',404);
            if($target['role']!=='customer'||$target['status']!=='active')fail('IMPERSONATION_UNAVAILABLE','Only an active customer account can be opened.');
            $expires=gmdate('Y-m-d H:i:s',min(time()+3600,strtotime($parent['expires_at'])));
            query('INSERT INTO sessions (token_hash,user_id,expires_at,impersonator_id,admin_session_hash) VALUES (?,?,?,?,?)',[hash('sha256',$token),$id,$expires,$actor['id'],$hash]);
            audit('admin_customer_login_started',$actor['id'],['customer'=>$id]);
            return $target;
        });
        self::cookie('tn_admin_return',$original,time()+3600); self::cookie('tn_session',$token,time()+3600);
        return ['message'=>'Customer session opened.','redirect'=>'/dashboard','user'=>safeUser($target)];
    }
    public static function context(): array
    {
        $token=$_COOKIE['tn_admin_return']??'';
        if(!$token)return ['active'=>false];
        $parent=one("SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.impersonator_id IS NULL AND u.role='admin' AND u.status='active'",[hash('sha256',$token),now()]);
        if(!$parent)return ['active'=>false];
        return ['active'=>true,'administrator_email'=>$parent['email']];
    }
    public static function stop(): array
    {
        $token=$_COOKIE['tn_admin_return']??''; $context=self::context();
        if(!$context['active'])fail('UNAUTHENTICATED','Your administrator session has expired. Sign in again.',401);
        tx(function()use($token){
            $parent=one('SELECT user_id FROM sessions WHERE token_hash=?',[hash('sha256',$token)]);
            query('DELETE FROM sessions WHERE admin_session_hash=?',[hash('sha256',$token)]);
            audit('admin_customer_login_ended',$parent['user_id']);
        });
        self::cookie('tn_session',$token,time()+3600);self::cookie('tn_admin_return','',time()-3600);
        return ['message'=>'Administrator session restored.','redirect'=>'/admin/users'];
    }
    public static function logout(): void
    {
        $current=$_COOKIE['tn_session']??'';$parent=$_COOKIE['tn_admin_return']??'';
        foreach(array_filter([$current,$parent])as$token)query('DELETE FROM sessions WHERE token_hash=? OR admin_session_hash=?',[hash('sha256',$token),hash('sha256',$token)]);
        self::cookie('tn_admin_return','',time()-3600);
    }
}

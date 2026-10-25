<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/TextVerifiedRentalProvider.php';
final class NumberRentals
{
    public static function listing(array $user):array
    {
        [$page]=paginate();$limit=10;
        query("UPDATE orders SET status='expired',rental_refundable=0 WHERE user_id=? AND product='long-term' AND provider='textverified' AND status='active' AND expires_at<=?",[$user['id'],now()]);
        $rows=all("SELECT * FROM orders WHERE user_id=? AND product='long-term' AND provider='textverified' ORDER BY created_at DESC,id DESC LIMIT ".$limit.' OFFSET '.(($page-1)*$limit),[$user['id']]);
        $pending=all("SELECT id,operation,resource_id,status,price_cents,created_at FROM fulfilment_intents WHERE user_id=? AND product='long-term' AND status IN ('pending','reconciliation','rejected') ORDER BY created_at DESC LIMIT 20",[$user['id']]);
        foreach($pending as&$item){$item['price_usd']=money((int)$item['price_cents']);unset($item['price_cents']);}
        return ['items'=>array_map([self::class,'public'],$rows),'pending'=>$pending,'page'=>$page,'per_page'=>$limit,'total'=>(int)one("SELECT COUNT(*) n FROM orders WHERE user_id=? AND product='long-term' AND provider='textverified'",[$user['id']])['n']];
    }
    public static function public(array $row):array
    {
        return ['id'=>$row['id'],'service'=>$row['service'],'phone'=>$row['phone'],'duration'=>$row['rental_duration'],'status'=>$row['status'],'price_usd'=>money((int)$row['price_cents']),'expires_at'=>$row['expires_at']?str_replace(' ','T',$row['expires_at']).'Z':null,'created_at'=>str_replace(' ','T',$row['created_at']).'Z','refundable'=>$row['status']==='active'&&!empty($row['rental_refundable']),'can_extend'=>$row['status']==='active'&&$row['expires_at']>now()];
    }
    public static function owned(array $user,string $id):array
    {
        $row=Commerce::owned('long-term',$id,$user['id']);if($row['provider']!=='textverified')fail('NOT_FOUND','Rental not found.',404);return $row;
    }
    public static function quote(array $user,array $input):array
    {
        $resource=isset($input['id'])?self::owned($user,required($input,'id',32)):null;
        $quote=(new TextVerifiedRentalProvider())->quote('long-term',$input,$resource);
        return ['currency'=>'USD','price_usd'=>money(Commerce::price('long-term',$quote)),'duration'=>$quote['duration']];
    }
    public static function inbox(array $user,string $id):array
    {
        $row=self::owned($user,$id);
        if($row['status']!=='active'||$row['expires_at']<=now())fail('RENTAL_EXPIRED','This rental is no longer active.');
        $items=(new TextVerifiedRentalProvider())->messages($row['provider_order_id']);
        $fresh=self::owned($user,$id);if($fresh['status']!=='active'||$fresh['expires_at']<=now())fail('RENTAL_EXPIRED','This rental is no longer active.');
        return ['items'=>$items];
    }
}

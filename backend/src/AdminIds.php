<?php
declare(strict_types=1);
namespace TempNumber;

final class AdminIds
{
    public static function number(string $type, string $id): int
    {
        $saved=one('SELECT number FROM admin_numeric_ids WHERE resource_type=? AND resource_id=?',[$type,$id]);
        if($saved)return (int)$saved['number'];
        return tx(function()use($type,$id){
            $sequence=one('SELECT next_id FROM admin_id_sequence WHERE name=?'.lockSuffix(),['records']);
            $saved=one('SELECT number FROM admin_numeric_ids WHERE resource_type=? AND resource_id=?',[$type,$id]);
            if($saved)return (int)$saved['number'];
            $number=(int)$sequence['next_id'];
            query('UPDATE admin_id_sequence SET next_id=? WHERE name=?',[$number+1,'records']);
            query('INSERT INTO admin_numeric_ids (number,resource_type,resource_id) VALUES (?,?,?)',[$number,$type,$id]);
            return $number;
        });
    }
    public static function map(string $type, array $row): array
    {
        $map=[];
        foreach(['id'=>$type,'user_id'=>'users','referred_by'=>'users','order_id'=>'smm_orders']as$field=>$resource){
            if(is_string($row[$field]??null)&&$row[$field]!=='')$map[$row[$field]]=self::number($resource,$row[$field]);
        }
        if(!empty($row['resource_id'])){
            $resource=match($row['product']??''){'smm'=>'smm_orders','temp-mail'=>'inboxes',default=>'orders'};
            $map[$row['resource_id']]=self::number($resource,$row['resource_id']);
        }
        return $map;
    }
    public static function user(string $number): string
    {
        if(!ctype_digit($number))return $number;
        $row=one("SELECT resource_id FROM admin_numeric_ids WHERE number=? AND resource_type='users'",[$number]);
        return $row['resource_id']??'not-found';
    }
}

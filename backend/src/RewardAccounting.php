<?php
declare(strict_types=1);
namespace TempNumber;

final class RewardAccounting
{
    public static function completed(string $resource):void
    {
        query('UPDATE reward_costs SET settled_at=COALESCE(settled_at,?) WHERE resource_id=?',[now(),$resource]);
    }
    public static function record(string $source,string $user,string $resource,string $product,string $reference,array $quote,array $config):void
    {
        $cost=$quote['cost_minor']??null;$num=(int)($config['fx_numerator']??0);$den=(int)($config['fx_denominator']??0);
        if(!is_int($cost)||$cost<0||$num<1||$den<1||!in_array($product,['usa','global','smm','long-term'],true))return;
        $cents=(int)bcdiv(bcadd(bcmul((string)$cost,(string)$num,0),(string)($den-1),0),(string)$den,0);
        if(!one('SELECT source_id FROM reward_costs WHERE source_id=?',[$source]))query('INSERT INTO reward_costs (source_id,user_id,resource_id,product,ledger_reference,cost_cents,fx_numerator,fx_denominator,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[$source,$user,$resource,$product,$reference,$cents,$num,$den,now()]);
    }
    public static function receipt(string $source,array $receipt,?string $resource=null):void
    {
        $row=one('SELECT * FROM reward_costs WHERE source_id=?',[$source]);if(!$row)return;
        $cost=$receipt['cost_minor']??null;$cents=(int)$row['cost_cents'];
        if(is_int($cost)&&$cost>=0)$cents=max($cents,(int)bcdiv(bcadd(bcmul((string)$cost,(string)$row['fx_numerator'],0),(string)((int)$row['fx_denominator']-1),0),(string)$row['fx_denominator'],0));
        query('UPDATE reward_costs SET cost_cents=?,resource_id=? WHERE source_id=?',[$cents,$resource??$row['resource_id'],$source]);
    }
}

<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/TextVerifiedRentalProvider.php';

final class NumberSync
{
    /** Poll existing provider resources only: this never purchases, extends or cancels. */
    public static function run(?string $user=null,?NumberProvider $verification=null,?ProductProvider $rental=null,int $limit=10):array
    {
        $cutoff=gmdate('Y-m-d H:i:s',time()-15);
        $where="provider IN ('textverified','5sim') AND provider_order_id IS NOT NULL AND product IN ('usa','global','long-term') AND ((status IN ('active','reconciliation') AND updated_at<=?) OR (product='long-term' AND status='expired' AND expires_at>=? AND updated_at<=?))";
        $args=[$cutoff,gmdate('Y-m-d H:i:s',time()-604800),gmdate('Y-m-d H:i:s',time()-300)];
        if($user!==null){$where.=' AND user_id=?';$args[]=$user;}
        $rows=all('SELECT * FROM orders WHERE '.$where.' ORDER BY updated_at,id LIMIT '.max(1,min(20,$limit)),$args);
        $result=['synced'=>0,'deferred'=>0];$started=microtime(true);
        foreach($rows as$row){
            if(microtime(true)-$started>20)break;
            // Claim the polling interval across browser requests and the worker.
            $claimed=query('UPDATE orders SET updated_at=? WHERE id=? AND updated_at=? AND status=?',[now(),$row['id'],$row['updated_at'],$row['status']]);
            if($claimed->rowCount()!==1)continue;
            try{
                if($row['product']==='long-term')Commerce::synchronise('long-term',$row,'status',$rental);
                else Rentals::sync($row,false,$verification);
                $result['synced']++;
            }catch(\Throwable){$result['deferred']++;}
        }
        return $result;
    }
}

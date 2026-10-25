<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/SmmProvider.php';

final class SmmOrders
{
    public static function listing(array $user): array
    {
        [$page, $limit] = paginate();
        $rows = all('SELECT * FROM smm_orders WHERE user_id=? ORDER BY created_at DESC LIMIT '.$limit.' OFFSET '.(($page-1)*$limit), [$user['id']]);
        $items = array_map([self::class, 'public'], $rows);
        $pending = [];
        if ($page === 1) foreach (all("SELECT * FROM fulfilment_intents WHERE user_id=? AND product='smm' AND status IN ('pending','reconciliation','rejected') ORDER BY created_at DESC LIMIT 20", [$user['id']]) as $intent) {
            $input = json_decode($intent['request_payload'] ?? '{}', true) ?: [];
            $pending[] = ['id' => $intent['id'], 'service' => $input['service'] ?? '', 'service_name' => 'Submission '.$intent['id'],
                'target' => $input['target'] ?? '', 'quantity' => $input['quantity'] ?? 0, 'status' => $intent['status'],
                'price_usd' => money((int)$intent['price_cents']), 'created_at' => str_replace(' ', 'T', $intent['created_at']).'Z',
                'refill_supported' => false, 'awaiting_provisioning' => true, 'refill' => null, 'refund_review_required' => false];
        }
        return ['items' => $items, 'pending' => $pending, 'page' => $page, 'per_page' => $limit,
            'total' => (int)one('SELECT COUNT(*) n FROM smm_orders WHERE user_id=?', [$user['id']])['n']];
    }

    public static function public(array $row): array
    {
        $refill = one('SELECT id,status,created_at,updated_at FROM smm_refills WHERE order_id=? ORDER BY created_at DESC LIMIT 1', [$row['id']]);
        return ['id' => $row['id'], 'service' => $row['service'], 'service_name' => $row['service_name'] ?: $row['service'],
            'target' => $row['target'], 'quantity' => (int)$row['quantity'], 'status' => $row['status'],
            'price_usd' => money((int)$row['price_cents']), 'start_count' => $row['start_count'] === null ? null : (int)$row['start_count'],
            'remaining' => $row['remaining'] === null ? null : (int)$row['remaining'], 'refill_supported' => (bool)$row['refill_supported'],
            'refill' => $refill, 'awaiting_provisioning' => false, 'refund_review_required' => in_array($row['status'], ['partial','cancelled'], true),
            'created_at' => str_replace(' ', 'T', $row['created_at']).'Z', 'updated_at' => $row['updated_at'] ? str_replace(' ', 'T', $row['updated_at']).'Z' : null];
    }

    public static function refresh(array $row, ?SmmProvider $adapter = null, bool $force = false): array
    {
        if (!$force && $row['last_status_at'] && strtotime($row['last_status_at']) > time()-10) return self::public($row);
        try {
            $result = ($adapter ?? new SmmProvider())->action((string)$row['provider_order_id'], 'status');
            tx(function () use ($row, $result) {
                $current = one('SELECT * FROM smm_orders WHERE id=?'.lockSuffix(), [$row['id']]);
                if (in_array($current['status'], ['completed','cancelled','partial'], true) && $current['status'] !== $result['status']) return;
                require_once __DIR__.'/RewardAccounting.php';
                foreach(all('SELECT source_id FROM reward_costs WHERE resource_id=?',[$row['id']])as$cost)RewardAccounting::receipt($cost['source_id'],$result);
                if($result['status']==='completed')RewardAccounting::completed($row['id']);
                query('UPDATE smm_orders SET status=?,provider_status=?,start_count=?,remaining=?,updated_at=?,last_status_at=?,status_error=NULL WHERE id=?',
                    [$result['status'], $result['provider_status'], $result['start_count'] ?? $current['start_count'], $result['remaining'] ?? $current['remaining'], now(), now(), $row['id']]);
            });
        } catch (\Throwable $error) {
            query('UPDATE smm_orders SET status_error=?,last_status_at=? WHERE id=?', ['Status check unavailable', now(), $row['id']]);
            throw $error;
        }
        return self::public(one('SELECT * FROM smm_orders WHERE id=?', [$row['id']]));
    }

    public static function refill(array $user, string $id, ?SmmProvider $adapter = null): array
    {
        $row = Commerce::owned('smm', $id, $user['id']);
        if (!(bool)$row['refill_supported']) fail('REFILL_UNAVAILABLE', 'This service does not offer refills.');
        if ($row['status'] === 'cancelled') fail('REFILL_UNAVAILABLE', 'A cancelled order cannot be refilled.');
        $new = id();
        $intent = tx(function () use ($row, $new) {
            one('SELECT id FROM smm_orders WHERE id=?'.lockSuffix(), [$row['id']]);
            $existing = one("SELECT * FROM smm_refills WHERE order_id=? AND status IN ('pending','active','reconciliation') ORDER BY created_at DESC LIMIT 1", [$row['id']]);
            if ($existing) return $existing;
            query('INSERT INTO smm_refills (id,order_id,status,created_at,updated_at) VALUES (?,?,?,?,?)', [$new,$row['id'],'pending',now(),now()]);
            return one('SELECT * FROM smm_refills WHERE id=?', [$new]);
        });
        if ($intent['id'] !== $new) return ['id'=>$intent['id'],'status'=>$intent['status']];
        try {
            $response = ($adapter ?? new SmmProvider())->request('refill', ['order'=>$row['provider_order_id']], true);
            if (!isset($response['refill']) || !preg_match('/^\d+$/D', (string)$response['refill'])) throw new AmbiguousProvisioning('Missing refill identifier.');
            query('UPDATE smm_refills SET provider_refill_id=?,updated_at=? WHERE id=?', [(string)$response['refill'],now(),$new]);
        } catch (ProviderRejected $error) {
            query("UPDATE smm_refills SET status='failed',updated_at=? WHERE id=?", [now(),$new]);
            throw $error;
        } catch (\Throwable $error) {
            query("UPDATE smm_refills SET status='reconciliation',updated_at=? WHERE id=?", [now(),$new]);
        }
        audit('smm_refill_requested', $user['id'], ['order_id'=>$row['id'],'refill_id'=>$new]);
        return self::refillStatus($user, $new, $adapter);
    }

    public static function refillStatus(array $user, string $id, ?SmmProvider $adapter = null): array
    {
        $refill = one('SELECT r.* FROM smm_refills r JOIN smm_orders o ON o.id=r.order_id WHERE r.id=? AND o.user_id=?', [$id,$user['id']]);
        if (!$refill) fail('NOT_FOUND', 'Refill not found.', 404);
        if ($refill['provider_refill_id'] && in_array($refill['status'], ['pending','active'], true)) {
            $response = ($adapter ?? new SmmProvider())->request('refill_status', ['refill'=>$refill['provider_refill_id']]);
            $status = match(strtolower((string)($response['status'] ?? ''))) {'completed'=>'completed','pending'=>'pending','in progress','processing'=>'active','rejected','failed'=>'failed',default=>'reconciliation'};
            query('UPDATE smm_refills SET status=?,updated_at=? WHERE id=?', [$status,now(),$id]);
            $refill['status'] = $status;
        }
        return ['id'=>$id,'status'=>$refill['status']];
    }
}

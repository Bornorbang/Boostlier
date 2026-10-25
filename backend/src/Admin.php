<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/AdminIds.php';

final class Admin
{
    private const RECORDS = [
        'users' => ['users', 'id,name,email,role,status,referral_code,referred_by,created_at', ['id','name','email']],
        'rentals' => ['orders', 'id,user_id,provider,provider_order_id,service,phone,status,price_cents,rental_duration,rental_refundable,expires_at,created_at,updated_at', ['id','service','phone','provider_order_id']],
        'numbers' => ['orders', 'id,user_id,product,provider,provider_order_id,service,country,phone,sms_code,status,price_cents,expires_at,created_at,updated_at,provider_state,can_cancel,hidden_from_numbers,customer_refund_cents,customer_refund_reason,customer_refunded_at', ['id','phone','service','provider_order_id']],
        'boost-orders' => ['smm_orders', 'id,user_id,provider_order_id,service,service_name,target,quantity,status,price_cents,start_count,remaining,refill_supported,provider_status,status_error,created_at,updated_at', ['id','service_name','target','provider_order_id']],
        'temp-mail' => ['inboxes', 'id,user_id,address,provider_id,status,price_cents,created_at,expires_at', ['id','address']],
        'ads' => ['ads', 'id,user_id,title,target_url,status,price_cents,created_at,expires_at', ['id','title','target_url']],
        'wallet-history' => ['ledger', 'id,user_id,kind,amount_cents,balance_after_cents,reserved_after_cents,reference,description,created_at', ['reference','description','kind']],
        'payments' => ['payments', 'id,user_id,provider,provider_reference,amount_cents,currency,status,created_at,updated_at', ['id','provider_reference']],
        'support' => ['support_tickets', 'id,user_id,issue_type,payment_reference,description,status,created_at', ['id','payment_reference','description']],
        'operations' => ['fulfilment_intents', 'id,user_id,product,operation,resource_id,price_cents,status,created_at,updated_at', ['id','product','resource_id']],
        'audit-log' => ['audit_log', 'id,user_id,action,details,created_at', ['action','details','user_id']],
    ];

    private static function guard(array $actor): void
    {
        if (($actor['role'] ?? '') !== 'admin' || ($actor['status'] ?? '') !== 'active' || !empty($actor['impersonator_id'])) fail('FORBIDDEN', 'Administrator access is required.', 403);
    }
    private static function definition(string $section): array
    {
        if (!isset(self::RECORDS[$section])) fail('NOT_FOUND', 'Admin page not found.', 404);
        return self::RECORDS[$section];
    }
    private static function scope(string $section): string
    {
        return match($section){'rentals'=>" AND product='long-term' AND provider='textverified'",'numbers'=>" AND product IN ('usa','global')",default=>''};
    }
    private static function source(string $section): string
    {
        if ($section !== 'operations') return self::definition($section)[0];
        return "(SELECT id,user_id,product,operation,resource_id,price_cents,status,created_at,updated_at FROM fulfilment_intents UNION ALL SELECT id,user_id,product,'purchase' AS operation,id AS resource_id,price_cents,status,created_at,updated_at FROM orders WHERE product IN ('usa','global') AND status IN ('pending','reconciliation') UNION ALL SELECT id,user_id,'temp-mail' AS product,operation,inbox_id AS resource_id,price_cents,status,created_at,updated_at FROM temp_mail_operations WHERE status='pending')";
    }
    private static function idType(string $section,array $row): string
    {
        if($section==='operations'){
            if(in_array($row['product'],['usa','global'],true))return 'orders';
            if($row['product']==='temp-mail'&&one('SELECT id FROM temp_mail_operations WHERE id=?',[$row['id']]))return 'temp_mail_operations';
        }
        return self::definition($section)[0];
    }
    public static function listing(array $actor, string $section, array $input): array
    {
        self::guard($actor); [$table,$columns,$fields] = self::definition($section); $table = self::source($section);
        $page = max(1, min(1000000, (int)($input['page'] ?? 1))); $limit = 20;
        $where = '1=1'; $args = [];
        if ($section === 'operations' && ($input['status'] ?? '') === '') $where .= " AND r.status IN ('pending','reconciliation')";
        if ($section === 'rentals') $where .= " AND r.product='long-term' AND r.provider='textverified'";
        if ($section === 'numbers') $where .= " AND r.product IN ('usa','global')";
        if (($input['search'] ?? '') !== '') {
            $where .= ' AND (' . implode(' OR ', array_map(fn($f) => 'r.' . $f . ' LIKE ?', $fields)) . ')';
            foreach ($fields as $_) $args[] = '%' . mb_substr((string)$input['search'], 0, 200) . '%';
        }
        if (($input['status'] ?? '') !== '' && !in_array($section, ['wallet-history','audit-log'], true)) {
            $statusField = in_array($section, ['ads','temp-mail','rentals'], true) ? "CASE WHEN r.status='active' AND r.expires_at<=" . db()->quote(now()) . " THEN 'expired' ELSE r.status END" : 'r.status';
            $where .= ' AND (' . $statusField . ')=?'; $args[] = $input['status'];
        }
        if (($input['user_id'] ?? '') !== '' && $section !== 'users') { $where .= ' AND r.user_id=?'; $args[] = AdminIds::user((string)$input['user_id']); }
        $filterFields = match($section) {'users'=>['role'],'wallet-history'=>['kind'],'numbers','rentals','payments'=>['provider'],'boost-orders'=>['service_name'],'support'=>['issue_type'],'operations'=>['product'],'audit-log'=>['action'],default=>[]};
        $filterOptions=[];
        foreach($filterFields as $field){
            $filterOptions[$field]=array_column(all('SELECT DISTINCT '.$field.' FROM '.$table.' r WHERE '.$field.' IS NOT NULL ORDER BY '.$field.' LIMIT 200'),$field);
            if(($input[$field]??'')!==''){$where.=' AND r.'.$field.'=?';$args[]=$input[$field];}
        }
        if($section==='wallet-history'&&($input['direction']??'')!==''){
            if(!in_array($input['direction'],['credit','debit'],true))fail('INVALID_FILTER','Choose credit or debit.');
            $where.=$input['direction']==='credit'?' AND r.amount_cents>0':' AND r.amount_cents<0';
        }
        $dates=[];
        foreach(['from','until']as$key)if(($input[$key]??'')!==''){
            $raw=$input[$key];
            if(!is_string($raw)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$raw))fail('INVALID_DATE','Choose valid dates.');
            $date=\DateTimeImmutable::createFromFormat('!Y-m-d',$raw,new \DateTimeZone('Europe/London'));
            if(!$date||$date->format('Y-m-d')!==$raw)fail('INVALID_DATE','Choose valid dates.');
            $dates[$key]=$date;
            $where.=$key==='from'?' AND r.created_at>=?':' AND r.created_at<?';
            $args[]=($key==='until'?$date->modify('+1 day'):$date)->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        }
        if(isset($dates['from'],$dates['until'])&&$dates['from']>$dates['until'])fail('INVALID_DATE','The end date must follow the start date.');
        if ($section === 'users' && ($input['claimed_rewards'] ?? '') === '1') $where .= ' AND EXISTS (SELECT 1 FROM reward_claims c WHERE c.user_id=r.id)';
        $select = implode(',', array_map(fn($f) => 'r.' . $f, explode(',', $columns)));
        $join = $section === 'users' ? '' : ' LEFT JOIN users u ON u.id=r.user_id';
        if ($join) $select .= ',u.email AS customer_email,u.name AS customer_name';
        $sort=$input['sort']??'created_at';$direction=strtoupper((string)($input['order']??'desc'));
        if(!in_array($sort,array_merge(explode(',',$columns),$join?['customer_email']:[]),true)||!in_array($direction,['ASC','DESC'],true))fail('INVALID_SORT','Choose a valid sort field and direction.');
        $sortColumn=$sort==='customer_email'?'u.email':'r.'.$sort;
        $total = (int)one('SELECT COUNT(*) n FROM ' . $table . ' r WHERE ' . $where, $args)['n'];
        $items = all('SELECT ' . $select . ' FROM ' . $table . ' r' . $join . ' WHERE ' . $where . ' ORDER BY '.$sortColumn.' '.$direction.',r.id '.$direction.' LIMIT ' . $limit . ' OFFSET ' . (($page-1)*$limit), $args);
        foreach ($items as &$item) {
            if (in_array($section, ['ads','temp-mail','rentals'], true) && $item['status'] === 'active' && $item['expires_at'] <= now()) $item['status'] = 'expired';
            $item['display_id']=AdminIds::number(self::idType($section,$item),$item['id']);
            if(isset($item['user_id']))$item['customer_number']=AdminIds::number('users',$item['user_id']);
        }
        return ['items'=>$items,'total'=>$total,'page'=>$page,'per_page'=>$limit,'filter_options'=>$filterOptions];
    }
    public static function overview(array $actor): array
    {
        self::guard($actor);
        $count = static fn($table, $where='1=1') => (int)one('SELECT COUNT(*) n FROM ' . $table . ' WHERE ' . $where)['n'];
        return [
            'active_rentals'=>$count('orders',"product='long-term' AND provider='textverified' AND status='active' AND expires_at>".db()->quote(now())),
            'users'=>$count('users'), 'active_users'=>$count('users', "status='active'"),
            'numbers'=>$count('orders', "product IN ('usa','global')"),
            'active_numbers'=>$count('orders', "product IN ('usa','global') AND status='active' AND hidden_from_numbers=0 AND expires_at>" . db()->quote(now())),
            'boost_orders'=>$count('smm_orders'), 'active_boosts'=>$count('smm_orders', "status IN ('active','pending','reconciliation')"),
            'active_inboxes'=>$count('inboxes', "status='active' AND expires_at>" . db()->quote(now())),
            'active_ads'=>$count('ads', "status='active' AND expires_at>" . db()->quote(now())),
            'open_support'=>$count('support_tickets', "status NOT IN ('resolved','closed')"),
            'pending_operations'=>$count('fulfilment_intents', "status IN ('pending','reconciliation')") + $count('orders', "product IN ('usa','global') AND status IN ('pending','reconciliation')") + $count('temp_mail_operations', "status='pending'"),
            'credited_topups_cents'=>(int)one("SELECT COALESCE(SUM(amount_cents),0) n FROM payments WHERE status='successful'")['n'],
            'verified_revenue_cents'=>-(int)one("SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE kind IN ('purchase','renewal','refund')")['n'],
            'wallet_liability_cents'=>(int)one('SELECT COALESCE(SUM(balance_cents),0) n FROM wallets')['n'],
            'reserved_cents'=>(int)one('SELECT COALESCE(SUM(reserved_cents),0) n FROM wallets')['n'],
            'recent_activity'=>all('SELECT a.id,a.action,a.details,a.created_at,u.email AS actor_email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC,a.id DESC LIMIT 8'),
            'last_job'=>one('SELECT name,status,started_at,finished_at FROM job_runs ORDER BY started_at DESC LIMIT 1'),
        ];
    }
    public static function record(array $actor, string $section, string $id): array
    {
        self::guard($actor); [$table,$columns] = self::definition($section); $table = self::source($section);
        $row = one('SELECT ' . $columns . ' FROM ' . $table . ' r WHERE id=?'.self::scope($section), [$id]);
        if (!$row) fail('NOT_FOUND', 'Record not found.', 404);
        if($section==='rentals'&&$row['status']==='active'&&$row['expires_at']<=now()){$row['status']='expired';$row['rental_refundable']=0;}
        $result = ['record'=>$row,'display_ids'=>AdminIds::map(self::idType($section,$row),$row)];
        if($section==='support')$result['has_receipt']=(bool)(one('SELECT attachment FROM support_tickets WHERE id=?',[$id])['attachment']??'');
        if($section==='rentals'){
            $result['operations']=all("SELECT id,operation,status,price_cents,created_at,updated_at FROM fulfilment_intents WHERE resource_id=? AND user_id=? AND product='long-term' ORDER BY created_at DESC,id DESC LIMIT 50",[$id,$row['user_id']]);
            foreach($result['operations']as$operation)$result['display_ids']+=AdminIds::map('fulfilment_intents',$operation);
            $result['refund']=one('SELECT amount_cents,created_at FROM ledger WHERE user_id=? AND reference=?',[$row['user_id'],'commerce-refund:long-term:'.$id]);
        }
        if (isset($row['user_id'])) $result['customer'] = one('SELECT id,name,email,status FROM users WHERE id=?', [$row['user_id']]);
        if ($section === 'users') {
            $result['wallet'] = Wallet::balance($id);
            $result['ledger'] = all('SELECT kind,amount_cents,reference,description,created_at FROM ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 20', [$id]);
            $result['counts'] = [];
            foreach (['orders','smm_orders','inboxes','ads'] as $t) $result['counts'][$t] = (int)one('SELECT COUNT(*) n FROM ' . $t . ' WHERE user_id=?', [$id])['n'];
        }
        if ($section === 'numbers') $result['messages'] = all('SELECT body,created_at FROM messages WHERE order_id=? ORDER BY created_at DESC', [$id]);
        if ($section === 'boost-orders') {
            $result['refills'] = all('SELECT id,status,provider_refill_id,created_at,updated_at FROM smm_refills WHERE order_id=? ORDER BY created_at DESC', [$id]);
            foreach($result['refills']as$refill)$result['display_ids']+=AdminIds::map('smm_refills',$refill);
        }
        audit('admin_record_viewed', $actor['id'], ['section'=>$section,'record'=>$id]);
        return $result;
    }
    public static function action(array $actor, array $input): array
    {
        self::guard($actor);
        $section = required($input, 'section', 40); $action = required($input, 'action', 40); $id = required($input, 'id', 32);
        $reason = required($input, 'reason', 500);
        [$table] = self::definition($section);
        $row = one('SELECT * FROM ' . self::source($section) . ' r WHERE id=?'.self::scope($section), [$id]);
        if (!$row) fail('NOT_FOUND', 'Record not found.', 404);
        // Record attempts too: upstream failures must remain visible to operators.
        audit('admin_action_requested', $actor['id'], ['section'=>$section,'action'=>$action,'record'=>$id,'reason'=>$reason]);
        $result = null;
        if ($section === 'users' && $action === 'update') {
            $status = $input['status'] ?? $row['status']; $role = $input['role'] ?? $row['role'];
            $name=isset($input['name'])?required($input,'name',120):$row['name'];
            $email=isset($input['email'])?strtolower(required($input,'email',254)):$row['email'];
            if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail('INVALID_EMAIL','Enter a valid email address.');
            $password=$input['password']??'';
            if(!is_string($password)||($password!==''&&(strlen($password)<12||strlen($password)>200)))fail('WEAK_PASSWORD','Use a password of 12 to 200 characters.');
            if (!in_array($status, ['active','disabled'], true) || !in_array($role, ['customer','admin'], true)) fail('VALIDATION_ERROR', 'Choose a valid account status and role.');
            if ($id === $actor['id'] && ($status !== 'active' || $role !== 'admin')) fail('SELF_LOCKOUT', 'You cannot disable or demote your own administrator account.');
            tx(function () use ($id,$status,$role,$actor,$reason,$name,$email,$password) {
                $activeAdmins = all("SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY id" . lockSuffix());
                if (!in_array($actor['id'], array_column($activeAdmins, 'id'), true)) fail('FORBIDDEN', 'Administrator access has been revoked.', 403);
                one('SELECT id FROM users WHERE id=?' . lockSuffix(), [$id]);
                if(one('SELECT id FROM users WHERE email=? AND id<>?',[$email,$id]))fail('ACCOUNT_EXISTS','Another account uses this email address.');
                query('UPDATE users SET status=?,role=?,name=?,email=? WHERE id=?', [$status,$role,$name,$email,$id]);
                if($password!==''){
                    query('UPDATE users SET password_hash=? WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$id]);
                    query('UPDATE reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL',[now(),$id]);
                    query('DELETE FROM sessions WHERE user_id=? OR impersonator_id=?',[$id,$id]);
                }
                if ($status === 'disabled' || $role !== 'admin') query('DELETE FROM sessions WHERE user_id=?', [$id]);
                audit('admin_account_updated', $actor['id'], ['customer'=>$id,'status'=>$status,'role'=>$role,'reason'=>$reason]);
            });
        } elseif ($section === 'users' && $action === 'adjust-wallet') {
            $amount = cents($input['amount_usd'] ?? null); $direction = $input['direction'] ?? '';
            if ($amount < 1 || $amount > 100000000 || !in_array($direction, ['credit','debit'], true)) fail('INVALID_AMOUNT', 'Enter a positive USD amount and choose credit or debit.');
            if ($direction === 'debit') $amount = -$amount;
            $key = required($input, 'idempotency_key', 100);
            tx(function () use ($id,$amount,$key,$reason,$actor) {
                $reference = 'admin:' . $actor['id'] . ':' . $key;
                one('SELECT user_id FROM wallets WHERE user_id=?' . lockSuffix(), [$id]);
                $existing = one('SELECT * FROM ledger WHERE reference=?', [$reference]);
                if ($existing && ($existing['user_id'] !== $id || (int)$existing['amount_cents'] !== $amount || $existing['description'] !== $reason)) fail('IDEMPOTENCY_CONFLICT', 'This adjustment key was used with different details.', 409);
                if (Wallet::change($id, 'adjustment', $amount, $reference, $reason)) audit('admin_wallet_adjusted', $actor['id'], ['customer'=>$id,'amount_cents'=>$amount,'reason'=>$reason]);
            });
        } elseif ($section === 'numbers' && in_array($action, ['sync','cancel'], true)) {
            if (!in_array($row['product'], ['usa','global'], true)) fail('INVALID_PRODUCT', 'Choose a number verification.');
            if ($action === 'cancel' && $row['status'] !== 'active') fail('INVALID_STATUS', 'Only an active verification can be cancelled.');
            $result = Rentals::sync($row, $action === 'cancel');
        } elseif ($section === 'rentals' && in_array($action,['sync','cancel'],true)) {if($row['product']!=='long-term'||$row['provider']!=='textverified')fail('NOT_FOUND','Rental not found.',404);$result=Commerce::synchronise('long-term',$row,$action==='cancel'?'cancel':'status');
        } elseif ($section === 'rentals' && $action === 'messages') {require_once __DIR__.'/NumberRentals.php';$result=NumberRentals::inbox(['id'=>$row['user_id']],$id);
        } elseif ($section === 'boost-orders' && $action === 'sync') $result = SmmOrders::refresh($row, null, true);
        elseif ($section === 'boost-orders' && $action === 'refill') $result = SmmOrders::refill(['id'=>$row['user_id']], $id);
        elseif ($section === 'boost-orders' && $action === 'refill-status') {
            $refill = one('SELECT id FROM smm_refills WHERE order_id=? ORDER BY created_at DESC LIMIT 1', [$id]);
            if (!$refill) fail('NOT_FOUND', 'No refill has been requested.', 404);
            $result = SmmOrders::refillStatus(['id'=>$row['user_id']], $refill['id']);
        } elseif ($section === 'temp-mail' && in_array($action, ['messages','message'], true)) $result = TempMail::messages(['id'=>$row['user_id']], $id, $action === 'message' ? required($input, 'message_id', 200) : null);
        elseif ($section === 'temp-mail' && $action === 'delete') $result = TempMail::delete(['id'=>$row['user_id']], $id, true);
        elseif ($section === 'temp-mail' && $action === 'extend') {
            tx(function () use ($id,$actor,$reason) {
                $current = one('SELECT * FROM inboxes WHERE id=?' . lockSuffix(), [$id]);
                if ($current['status'] !== 'active' || $current['expires_at'] <= now()) fail('INBOX_EXPIRED', 'Only an active inbox can be extended.');
                $expires = gmdate('Y-m-d H:i:s', strtotime($current['expires_at']) + 86400);
                query('UPDATE inboxes SET expires_at=? WHERE id=?', [$expires,$id]);
                audit('admin_inbox_extended', $actor['id'], ['inbox'=>$id,'expires_at'=>$expires,'reason'=>$reason,'charged'=>false]);
            });
        } elseif ($section === 'ads' && $action === 'remove') $result = Ads::remove(['id'=>$row['user_id']], $id, true);
        elseif ($section === 'ads' && $action === 'edit') {
            $title = required($input, 'title', 160); if(mb_strlen($title)>40)fail('INVALID_TITLE','Use an ad title of at most 40 characters.'); $target = Ads::target(required($input, 'target_url', 2048));
            query('UPDATE ads SET title=?,target_url=? WHERE id=?', [$title,$target,$id]);
        } elseif ($section === 'payments' && $action === 'verify') $result = Payments::verify($id);
        elseif ($section === 'support' && $action === 'update') {
            $status = $input['status'] ?? '';
            if (!in_array($status, ['open','in_progress','resolved','closed'], true)) fail('INVALID_STATUS', 'Choose a valid support status.');
            query('UPDATE support_tickets SET status=? WHERE id=?', [$status,$id]);
        } elseif ($section === 'operations' && $action === 'reconcile') {
            if ($row['product'] === 'temp-mail') $result = TempMail::recover($id);
            else { require_once __DIR__ . '/Reconciliation.php'; $result = Reconciliation::run($id); }
        } else fail('ACTION_UNAVAILABLE', 'This action is not supported for this feature.');
        audit('admin_action_completed', $actor['id'], ['section'=>$section,'action'=>$action,'record'=>$id,'reason'=>$reason]);
        return ['message'=>'Action completed.','result'=>$result];
    }

    public static function settings(array $actor): array
    {
        self::guard($actor);
        $global=Pricing::setting('5sim_pricing'); $number = Pricing::setting('textverified_pricing'); $rental=Pricing::setting('long-term_pricing'); $smm = Pricing::setting('smm_pricing');
        return ['global_fx'=>$global?bcdiv((string)$global['fx_numerator'],(string)$global['fx_denominator'],8):'1.00000000','global_margin_usd'=>money((int)($global['retail_margin_cents']??100)),'rental_fx'=>$rental?bcdiv((string)$rental['fx_numerator'],(string)$rental['fx_denominator'],8):'1.00000000','rental_margin_usd'=>money((int)($rental['retail_margin_cents']??150)),'number_fx'=>$number ? bcdiv((string)$number['fx_numerator'], (string)$number['fx_denominator'], 8) : '1.00000000',
            'number_margin_usd'=>money((int)($number['retail_margin_cents'] ?? 100)),
            'smm_fx'=>$smm ? bcdiv((string)$smm['fx_numerator'], (string)$smm['fx_denominator'], 8) : '0.00100000',
            'smm_markup'=>bcdiv((string)($smm['markup_basis_points'] ?? 10000), '100', 2),
            'temp_mail_price_usd'=>money(TempMail::price()),'ads_price_usd'=>money(Ads::price()),
            'connections'=>['global_numbers'=>(bool)env('FIVESIM_API_KEY'),'numbers'=>(bool)(env('TEXTVERIFIED_API_KEY') && env('TEXTVERIFIED_API_USERNAME')),'boost_socials'=>(bool)env('SMM_API_KEY'),'temporary_emails'=>(bool)env('RAPIDAPI_TEMP_MAIL_KEY'),'payments'=>(bool)env('STRIPE_SECRET_KEY')]];
    }
    public static function saveSettings(array $actor, array $input): array
    {
        self::guard($actor); $reason = required($input, 'reason', 500);
        $fx = static function($value): int {
            if (!is_string($value) || !preg_match('/^\d{1,4}(?:\.\d{1,8})?$/D', $value) || bccomp($value, '0', 8) <= 0) fail('INVALID_RATE', 'Use a positive exchange rate with at most eight decimal places.');
            return (int)bcmul($value, '100000000', 0);
        };
        $currentGlobal=Pricing::setting('5sim_pricing');$globalFx=$fx($input['global_fx']??($currentGlobal?bcdiv((string)$currentGlobal['fx_numerator'],(string)$currentGlobal['fx_denominator'],8):'1'));$globalMargin=cents($input['global_margin_usd']??money((int)($currentGlobal['retail_margin_cents']??100)));if($globalMargin>100000000)fail('INVALID_PRICE','Check the global number margin.');$currentRental=Pricing::setting('long-term_pricing');$rentalFx=$fx($input['rental_fx']??($currentRental?bcdiv((string)$currentRental['fx_numerator'],(string)$currentRental['fx_denominator'],8):'1'));$rentalMargin=cents($input['rental_margin_usd']??money((int)($currentRental['retail_margin_cents']??150)));if($rentalMargin>100000000)fail('INVALID_PRICE','Check the rental margin.');
        $numberFx = $fx($input['number_fx'] ?? null); $smmFx = $fx($input['smm_fx'] ?? null);
        $margin = cents($input['number_margin_usd'] ?? null); $mail = cents($input['temp_mail_price_usd'] ?? null); $ads = cents($input['ads_price_usd'] ?? null);
        $markup = $input['smm_markup'] ?? '';
        if (!is_string($markup) || !preg_match('/^\d{1,4}(?:\.\d{1,2})?$/D', $markup) || $mail < 1 || $ads < 1 || max($mail,$ads,$margin) > 100000000) fail('INVALID_PRICE', 'Check the prices and percentage markup.');
        $base = ['fx_denominator'=>100000000,'fx_updated_at'=>now(),'fx_mode'=>'fixed','rounding_cents'=>1];
        $values = ['5sim_pricing'=>$base+['currency'=>'USD','fx_numerator'=>$globalFx,'retail_margin_cents'=>$globalMargin,'wholesale_margin_cents'=>$globalMargin],'long-term_pricing'=>$base+['currency'=>'USD','fx_numerator'=>$rentalFx,'retail_margin_cents'=>$rentalMargin,'wholesale_margin_cents'=>$rentalMargin],'textverified_pricing'=>$base + ['currency'=>'USD','fx_numerator'=>$numberFx,'retail_margin_cents'=>$margin,'wholesale_margin_cents'=>$margin],
            'smm_pricing'=>$base + ['currency'=>'NGN','fx_numerator'=>$smmFx,'markup_basis_points'=>(int)bcmul($markup, '100', 0)],
            'service_prices'=>['temp_mail_cents'=>$mail,'ads_cents'=>$ads]];
        tx(function () use ($values,$actor,$reason) {
            foreach ($values as $name=>$value) {
                if (one('SELECT name FROM settings WHERE name=?' . lockSuffix(), [$name])) query('UPDATE settings SET value=?,updated_at=? WHERE name=?', [json_encode($value),now(),$name]);
                else query('INSERT INTO settings (name,value,updated_at) VALUES (?,?,?)', [$name,json_encode($value),now()]);
            }
            audit('admin_pricing_updated', $actor['id'], ['reason'=>$reason,'settings'=>$values]);
        });
        return ['message'=>'Pricing saved. New purchases use these prices.'];
    }
}

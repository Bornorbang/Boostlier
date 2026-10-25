<?php
declare(strict_types=1);
namespace TempNumber;
$a=admin();$section=substr($path,7);[$page,$limit]=paginate();
require_once __DIR__.'/Admin.php';
if($section==='dashboard-notice'){
 require_once __DIR__.'/DashboardNotice.php';
 if($method==='GET')json(DashboardNotice::read());
 if($method==='PATCH'){rateLimit('dashboard-notice:'.$a['id'],10,60);json(DashboardNotice::save($a,body()));}
}
if($section==='reward-settings'&&$method==='GET'){$c=Pricing::setting('rewards_v3')??[];json(['enabled'=>!empty($c['enabled']),'topup_launch_date'=>$c['topup_launch_date']??'']);}
if($section==='reward-settings'&&$method==='PATCH'){
 $b=body();$enabled=$b['enabled']??null;if(!is_bool($enabled))fail('VALIDATION_ERROR','Choose whether rewards are enabled.');
 $launch=$b['topup_launch_date']??(Pricing::setting('rewards_v3')['topup_launch_date']??'');
 $date=is_string($launch)?\DateTimeImmutable::createFromFormat('!Y-m-d',$launch,new \DateTimeZone('Europe/London')):false;
 if(!$date||$date->format('Y-m-d')!==$launch)fail('VALIDATION_ERROR','Choose a valid top-up bonus launch date.');
 tx(function()use($enabled,$launch,$a){$row=one("SELECT value FROM settings WHERE name='rewards_v3'".lockSuffix());if(!$row)fail('REWARDS_UNCONFIGURED','Run the rewards migration.',503);$config=json_decode($row['value'],true);$config['enabled']=$enabled;$config['topup_launch_date']=$launch;query("UPDATE settings SET value=?,updated_at=? WHERE name='rewards_v3'",[json_encode($config),now()]);audit('rewards_settings_changed',$a['id'],['enabled'=>$enabled,'topup_launch_date'=>$launch]);});json(['enabled'=>$enabled,'topup_launch_date'=>$launch]);
}
if($method==='POST'&&$section==='impersonate'){require_once __DIR__.'/Impersonation.php';json(Impersonation::start($a,required(body(),'id',32)));}
if($method==='GET'&&$section==='overview')json(Admin::overview($a));
if($method==='GET'&&$section==='record')json(Admin::record($a,required($_GET,'section',40),required($_GET,'id',32)));
if($method==='POST'&&$section==='action'){rateLimit('admin-action:'.$a['id'],40,60);json(Admin::action($a,body()));}
if($section==='settings'&&$method==='GET')json(Admin::settings($a));
if($section==='settings'&&$method==='PATCH')json(Admin::saveSettings($a,body()));
if($method==='GET'&&in_array($section,['users','numbers','rentals','boost-orders','temp-mail','ads','wallet-history','payments','support','operations','audit-log'],true))json(Admin::listing($a,$section,$_GET));
if($method==='GET'&&$section==='ad-banner'){$row=one('SELECT banner_file,banner_mime FROM ads WHERE id=?',[required($_GET,'id',32)]);if(!$row)fail('NOT_FOUND','Banner not found.',404);$file=__DIR__.'/../storage/'.basename($row['banner_file']);if(!is_file($file))fail('NOT_FOUND','Banner file not found.',404);header('Content-Type: '.$row['banner_mime']);header('Cache-Control: no-store');readfile($file);exit;}
if($section==='user-wallet'&&$method==='GET'){$uid=required($_GET,'id',32);json(Wallet::balance($uid)+['items'=>all('SELECT * FROM ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[$uid])]);}
if($section==='user-rewards'&&$method==='GET'){$customer=one('SELECT * FROM users WHERE id=?',[required($_GET,'id',32)]);if(!$customer)fail('NOT_FOUND','Customer not found.',404);json(Rewards::progress($customer));}
if($section==='support-receipt'&&$method==='GET'){$t=one('SELECT * FROM support_tickets WHERE id=?',[required($_GET,'id',32)]);if(!$t)fail('NOT_FOUND','Receipt not found.',404);$file=__DIR__.'/../storage/'.$t['attachment'];if(!is_file($file))fail('NOT_FOUND','Receipt file not found.',404);audit('support_receipt_downloaded',$a['id'],['ticket'=>$t['id']]);header('Content-Type: '.$t['mime']);header('Content-Disposition: attachment; filename="receipt-'.basename($t['attachment']).'"');header('Cache-Control: no-store');readfile($file);exit;}
if($section==='temp-mail-inspect'&&$method==='GET'){$inbox=one('SELECT * FROM inboxes WHERE id=?',[required($_GET,'id',32)]);if(!$inbox)fail('NOT_FOUND','Inbox not found.',404);audit('admin_inbox_inspected',$a['id'],['inbox'=>$inbox['id']]);json(TempMail::messages(['id'=>$inbox['user_id']],$inbox['id']));}
if($section==='temp-mail-delete'&&$method==='POST'){$inbox=one('SELECT * FROM inboxes WHERE id=?',[required(body(),'id',32)]);if(!$inbox)fail('NOT_FOUND','Inbox not found.',404);if((body()['confirmed']??false)!==true)fail('CONFIRMATION_REQUIRED','Confirm inbox deletion.');TempMail::delete(['id'=>$inbox['user_id']],$inbox['id'],true);audit('admin_inbox_deleted',$a['id'],['inbox'=>$inbox['id']]);json(['message'=>'Inbox deleted.']);}
if($section==='wallet-adjustment'&&$method==='POST'){$b=body();json(Admin::action($a,['section'=>'users','action'=>'adjust-wallet','id'=>required($b,'user_id',32)]+$b));}
if($section==='users'&&$method==='PATCH'){$b=body();json(Admin::action($a,['section'=>'users','action'=>'update','reason'=>$b['reason']??'Legacy account status update']+$b));}
if(in_array($section,['announcements','updates'],true)&&$method==='POST'){$b=body();$id=$b['id']??id();$title=required($b,'title',160);$text=required($b,'body',10000);if(one('SELECT id FROM announcements WHERE id=?',[$id]))query('UPDATE announcements SET title=?,body=?,updated_at=? WHERE id=?',[$title,$text,now(),$id]);else query('INSERT INTO announcements (id,title,body,kind,created_at,updated_at) VALUES (?,?,?,?,?,?)',[$id,$title,$text,$section==='updates'?'update':'announcement',now(),now()]);audit('announcement_saved',$a['id'],['id'=>$id]);json(['id'=>$id]);}
if(in_array($section,['announcements','updates'],true)&&$method==='DELETE'){query('DELETE FROM announcements WHERE id=?',[required(body(),'id',32)]);audit('announcement_deleted',$a['id']);json(['message'=>'Deleted.']);}
$tables=['users'=>'users','wallet-history'=>'ledger','rental-history'=>'orders','long-term'=>'orders','dedicated'=>'orders','temp-mail'=>'inboxes','boost-orders'=>'smm_orders','rewards'=>'reward_claims','announcements'=>'announcements','updates'=>'announcements','support'=>'support_tickets'];
if(isset($tables[$section])&&$method==='GET'){$table=$tables[$section];$where='1=1';$args=[];if(in_array($section,['long-term','dedicated'],true)){$where.=' AND product=?';$args[]=$section;}if($section==='updates'){$where.=" AND kind='update'";}if($section==='users'&&isset($_GET['search'])){$where.=' AND (name LIKE ? OR email LIKE ?)';$args[]='%'.$_GET['search'].'%';$args[]='%'.$_GET['search'].'%';}if($section==='users'&&($_GET['claimed_rewards']??'')==='1')$where.=' AND EXISTS (SELECT 1 FROM reward_claims WHERE reward_claims.user_id=users.id)';
if(isset($_GET['user_id'])&&$_GET['user_id']!==''&&$table!=='users'&&$table!=='announcements'){$where.=' AND user_id=?';$args[]=$_GET['user_id'];}
if(isset($_GET['status'])&&$_GET['status']!==''&&in_array($table,['users','orders','inboxes','smm_orders','support_tickets'],true)){$where.=' AND status=?';$args[]=$_GET['status'];}
if($table!=='users'&&isset($_GET['search'])&&$_GET['search']!==''){$searchFields=match($table){'orders'=>['id','provider_order_id','service','phone'],'inboxes'=>['id','address','provider_id'],'smm_orders'=>['id','provider_order_id','service','target'],'ledger'=>['reference','description','kind'],'reward_claims'=>['reward','period'],'announcements'=>['title','body'],'support_tickets'=>['id','payment_reference'],default=>['id']};$where.=' AND ('.implode(' OR ',array_map(fn($f)=>$f.' LIKE ?',$searchFields)).')';foreach($searchFields as$field)$args[]='%'.$_GET['search'].'%';}
$columns=$section==='users'?'id,name,email,role,status,referral_code,referred_by,created_at':'*';$total=(int)one('SELECT COUNT(*) n FROM '.$table.' WHERE '.$where,$args)['n'];$items=all('SELECT '.$columns.' FROM '.$table.' WHERE '.$where.' ORDER BY created_at DESC LIMIT '.$limit.' OFFSET '.(($page-1)*$limit),$args);json(['items'=>$items,'total'=>$total,'page'=>$page,'per_page'=>$limit]);}

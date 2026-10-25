<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../backend/src/bootstrap.php';require __DIR__.'/../backend/src/AccountMail.php';
$action=$argv[1]??'';
if($action==='setup'){foreach(glob(__DIR__.'/../backend/migrations/*.sql')as$f)db()->exec(file_get_contents($f));echo '{}';}
elseif($action==='deliver'){
 $messages=[];$summary=AccountMail::deliver(null,10,function($to,$subject,$text,$html,$replyTo='',array $attachments=[])use(&$messages){$attachment_names=array_column($attachments,'name');$messages[]=compact('to','subject','text','html','replyTo','attachment_names');});echo json_encode(['summary'=>$summary,'messages'=>$messages]);
}elseif($action==='state')echo json_encode(['queue'=>all('SELECT kind,status FROM transactional_mail ORDER BY created_at'),'sessions'=>count(all('SELECT * FROM sessions'))]);

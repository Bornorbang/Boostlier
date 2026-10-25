<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/AccountMail.php';
final class SupportRequests {
 public const ISSUES=[
  'payment'=>'Wallet funding or missing payment',
  'sms'=>'USA or Global number SMS issue',
  'refund'=>'Cancellation or missing wallet refund',
  'rental'=>'Long-term rental issue',
  'boost'=>'Boost Account order issue',
  'email'=>'Temporary email issue',
  'api'=>'Developer API issue',
  'account'=>'Account or other enquiry'
 ];
 public static function upload(array $u,array $fields,?array $file,string $key):array {
  if(!$file||($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK||!is_string($file['tmp_name']??null)||!is_int($file['size']??null)||$file['size']<1||$file['size']>5*1024*1024||!is_uploaded_file($file['tmp_name']))fail('INVALID_ATTACHMENT','Upload a PDF, JPEG, PNG or WebP receipt of at most 5 MB.');
  $mime=(new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);$allowed=['application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
  if(!isset($allowed[$mime])||($mime!=='application/pdf'&&!getimagesize($file['tmp_name'])))fail('INVALID_ATTACHMENT','The receipt file type is not supported.');
  return self::submit($u,['issue_type'=>'payment','description'=>'Payment receipt submitted for missing wallet credit.','reference'=>''],$key,['tmp_name'=>$file['tmp_name'],'mime'=>$mime,'extension'=>$allowed[$mime],'sha256'=>hash_file('sha256',$file['tmp_name'])]);
 }
 public static function submit(array $u,array $b,string $key,?array $receipt=null):array {
  if(($u['status']??'')!=='active')fail('FORBIDDEN','This account is disabled.',403);
  if(!preg_match('/^[a-zA-Z0-9:_-]{8,100}$/D',$key))fail('IDEMPOTENCY_REQUIRED','A valid request key is required.');
  $type=required($b,'issue_type',80);if(!isset(self::ISSUES[$type]))fail('INVALID_ISSUE','Choose a supported issue.');
  $description=required($b,'description',2000);if(mb_strlen($description)<10)fail('VALIDATION_ERROR','Please describe your issue in at least 10 characters.');
  $reference=$b['reference']??'';if(!is_string($reference)||mb_strlen($reference)>255)fail('VALIDATION_ERROR','Use a reference of at most 255 characters.');$reference=trim($reference);
  $parts=[$type,$description,$reference];if($receipt)$parts[]=$receipt['sha256'];$hash=hash('sha256',json_encode($parts));
  $stored=null;
  try{return tx(function()use($u,$key,$type,$description,$reference,$hash,$receipt,&$stored){
   one('SELECT id FROM users WHERE id=?'.lockSuffix(),[$u['id']]);
   $old=one('SELECT * FROM support_tickets WHERE user_id=? AND request_key=?',[$u['id'],$key]);
   if($old){if(!hash_equals($old['request_hash'],$hash))fail('IDEMPOTENCY_CONFLICT','This submission key was already used for another request.',409);return self::receipt($old['id']);}
   $latest=one('SELECT created_at FROM support_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 1',[$u['id']]);
   if($latest&&strtotime($latest['created_at'])>time()-max(30,(int)env('SUPPORT_QUERY_COOLDOWN_SECONDS','60')))fail('SUPPORT_COOLDOWN','Please wait a minute before sending another support request.',429);
   $attachment='';$mime='';
   if($receipt){$attachment=id().'.'.$receipt['extension'];$target=__DIR__.'/../storage/'.$attachment;if(!move_uploaded_file($receipt['tmp_name'],$target))fail('UPLOAD_FAILED','Your receipt could not be stored.',503);$stored=$target;$mime=$receipt['mime'];}
   $id=id();query('INSERT INTO support_tickets (id,user_id,issue_type,payment_reference,description,attachment,mime,created_at,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',[$id,$u['id'],self::ISSUES[$type],$reference,$description,$attachment,$mime,now(),$key,$hash]);
   AccountMail::enqueue($u['id'],'support',$id);audit('support_submitted',$u['id'],['ticket_id'=>$id,'issue_type'=>$type]);return self::receipt($id);
  });}catch(\Throwable $e){if($stored&&is_file($stored))unlink($stored);throw $e;}
 }
 private static function receipt(string $id):array {return ['id'=>$id,'message'=>'Your query has been received. Our support team will reply to your account email.'];}
 public static function email(array $u,array $ticket):array {
  $subject='Boostlier support: '.$ticket['issue_type'];
  $fields=['Email: '.$u['email']];
  if(($ticket['attachment']??'')===''){
   if($ticket['payment_reference']!=='')$fields[]='Reference: '.$ticket['payment_reference'];
   $fields[]='Message: '.$ticket['description'];
  }
  $text=implode("\n\n",$fields);
  return [$subject,$text,'<html><body style="font-family:Arial,sans-serif;line-height:1.7"><p>'.nl2br(htmlspecialchars($text,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8')).'</p></body></html>'];
 }
}

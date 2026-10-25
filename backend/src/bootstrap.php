<?php
declare(strict_types=1);
namespace TempNumber;
use PDO;
date_default_timezone_set('UTC');
if (is_file(__DIR__.'/../vendor/autoload.php')) require __DIR__.'/../vendor/autoload.php';
foreach (is_file(__DIR__.'/../.env') ? file(__DIR__.'/../.env', FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) : [] as $line) {
 if (str_starts_with(trim($line),'#') || !str_contains($line,'=')) continue;
 [$key,$value]=explode('=',$line,2); if (getenv(trim($key))===false) putenv(trim($key).'='.trim($value," \t\n\r\0\x0B\"'"));
}
function env(string $name, string $default=''):string { $v=getenv($name); return $v===false?$default:$v; }
function id():string {return bin2hex(random_bytes(16));}
function now():string {return gmdate('Y-m-d H:i:s');}
function db():PDO {static $pdo; if($pdo)return $pdo; $dsn=env('DB_DSN','sqlite:'.__DIR__.'/../storage/development.sqlite');if(str_starts_with($dsn,'sqlite:storage/'))$dsn='sqlite:'.__DIR__.'/../'.substr($dsn,7);$pdo=new PDO($dsn,env('DB_USER'),env('DB_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]); if($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite'){$pdo->exec('PRAGMA foreign_keys=ON');$pdo->exec('PRAGMA busy_timeout=5000');}else{$pdo->exec("SET time_zone = '+00:00'");}return $pdo;}
function query(string $sql,array $args=[]):\PDOStatement {$s=db()->prepare($sql);$s->execute($args);return $s;}
function one(string $sql,array $args=[]):?array {$r=query($sql,$args)->fetch();return $r?:null;}
function all(string $sql,array $args=[]):array {return query($sql,$args)->fetchAll();}
function tx(callable $fn):mixed { $d=db(); $d->beginTransaction();try{$r=$fn();$d->commit();return $r;}catch(\Throwable $e){if($d->inTransaction())$d->rollBack();throw $e;}}
function lockSuffix():string {return db()->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':'';}
class Problem extends \RuntimeException {public function __construct(public string $key,string $message,public int $status=422){parent::__construct($message);}}
function fail(string $code,string $message,int $status=422):never {throw new Problem($code,$message,$status);}
function json(mixed $value,int $status=200):never {http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');echo json_encode($value,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);exit;}
function body():array {static $v;if($v!==null)return $v;try{$v=json_decode(file_get_contents('php://input'),true,32,JSON_THROW_ON_ERROR);}catch(\Throwable){fail('INVALID_JSON','A valid JSON object is required.');}if(!is_array($v)||array_is_list($v)&&$v!==[])fail('INVALID_JSON','A JSON object is required.');foreach(array_keys($v)as$key)if(preg_match('/_gbp$/i',(string)$key))fail('CURRENCY_CHANGED','This form uses a previous currency. Reload the page and confirm the USD price.',409);return $v;}
function required(array $data,string $key,int $max=255):string {$v=$data[$key]??'';if(!is_string($v)||trim($v)===''||mb_strlen($v)>$max)fail('VALIDATION_ERROR','Check the '.$key.' field.');return trim($v);}
function money(int $cents):string {return ($cents<0?'-':'').intdiv(abs($cents),100).'.'.str_pad((string)(abs($cents)%100),2,'0',STR_PAD_LEFT);}
function cents(mixed $value):int {if(!is_string($value)||!preg_match('/^\d{1,7}\.\d{2}$/D',$value))fail('INVALID_AMOUNT','Use a USD decimal string with exactly two decimal places.');[$whole,$fraction]=explode('.',$value);return (int)$whole*100+(int)$fraction;}
function audit(string $action,?string $user=null,array $details=[]):void {if(!empty($GLOBALS['admin_impersonator']))$details['impersonator_id']=$GLOBALS['admin_impersonator'];query('INSERT INTO audit_log (id,user_id,action,details,created_at) VALUES (?,?,?,?,?)',[id(),$user,$action,json_encode($details),now()]);}
function rateLimit(string $scope,int $limit=60,int $seconds=60):void {$bucket=(string)intdiv(time(),$seconds);$hash=hash('sha256',$scope.':'.$bucket);tx(function()use($hash,$limit,$seconds){$row=one('SELECT * FROM rate_limits WHERE id=?'.lockSuffix(),[$hash]);if($row&&$row['hits']>=$limit){header('Retry-After: '.$seconds);fail('RATE_LIMITED','Too many requests. Please retry later.',429);}if($row)query('UPDATE rate_limits SET hits=hits+1 WHERE id=?',[$hash]);else query('INSERT INTO rate_limits (id,hits,expires_at) VALUES (?,1,?)',[$hash,gmdate('Y-m-d H:i:s',time()+$seconds*2)]);});}
function user(bool $api=false):array {if($api){$key=$_SERVER['HTTP_X_API_KEY']??'';$row=$key?one('SELECT u.*, k.id AS key_id FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.key_hash=? AND k.revoked_at IS NULL',[hash('sha256',$key)]):null;if(!$row)fail('UNAUTHENTICATED','A valid API key is required.',401);if($row['status']!=='active')fail('FORBIDDEN','This account is disabled.',403);rateLimit('api:'.$row['key_id'],(int)env('API_REQUESTS_PER_MINUTE','60'));query('UPDATE api_keys SET last_used_at=? WHERE id=?',[now(),$row['key_id']]);return $row;}
 $token=$_COOKIE['tn_session']??'';$row=$token?one('SELECT u.*,s.impersonator_id,s.admin_session_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',[hash('sha256',$token),now()]):null;if(!$row)fail('UNAUTHENTICATED','Please sign in to continue.',401);if($row['status']!=='active')fail('FORBIDDEN','This account is disabled.',403);if(!empty($row['impersonator_id'])){$parent=one("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND s.impersonator_id IS NULL AND u.role='admin' AND u.status='active'",[$row['admin_session_hash'],$row['impersonator_id'],now()]);if(!$parent)fail('UNAUTHENTICATED','The administrator session has ended.',401);$GLOBALS['admin_impersonator']=$row['impersonator_id'];}return $row;}
function admin():array {$u=user();if($u['role']!=='admin'||!empty($u['impersonator_id']))fail('FORBIDDEN','Administrator access is required.',403);return $u;}
function session(array $u):void {$token=bin2hex(random_bytes(32));query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',[hash('sha256',$token),$u['id'],gmdate('Y-m-d H:i:s',time()+86400*7)]);setcookie('tn_session',$token,['expires'=>time()+86400*7,'path'=>'/','secure'=>env('APP_ENV')==='production','httponly'=>true,'samesite'=>'Lax']);}
function safeUser(array $u):array {return array_intersect_key($u,array_flip(['id','name','email','role','status','referral_code','created_at']));}
function paginate():array {return [max(1,(int)($_GET['page']??1)),max(1,min(100,(int)($_GET['per_page']??20)))];}
function sendMail(string $to,string $subject,string $text,string $html='',string $replyTo='',array $attachments=[]):void {
 if(!env('SMTP_HOST')||!env('SMTP_FROM'))fail('MAIL_UNAVAILABLE','Email delivery has not been configured.',503);
 $mail=new \PHPMailer\PHPMailer\PHPMailer(true);$mail->isSMTP();
 $mail->Host=env('SMTP_HOST');$mail->Port=(int)env('SMTP_PORT','465');$mail->SMTPAuth=true;
 $mail->Username=env('SMTP_USER');$mail->Password=env('SMTP_PASSWORD');
 $encryption=env('SMTP_ENCRYPTION',$mail->Port===465?'smtps':'tls');
 if(!in_array($encryption,['smtps','tls'],true))throw new \RuntimeException('SMTP requires TLS');
 $mail->SMTPSecure=$encryption==='smtps'?\PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS:\PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
 $mail->Timeout=15;$mail->getSMTPInstance()->Timelimit=20;$mail->CharSet='UTF-8';
 $mail->setFrom(env('SMTP_FROM'),env('SMTP_FROM_NAME','Boostlier'));$mail->addAddress($to);
 if($replyTo!=='')$mail->addReplyTo($replyTo);
 foreach($attachments as$attachment)$mail->addAttachment($attachment['path'],$attachment['name']);
 $mail->Subject=$subject;
 if($html!==''){$mail->isHTML(true);$mail->Body=$html;$mail->AltBody=$text;}else $mail->Body=$text;
 $mail->send();
}

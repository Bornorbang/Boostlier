<?php
declare(strict_types=1);
namespace TempNumber;
if(!str_contains(getenv('DB_DSN')?:'','admin-qa-'))exit(1);
require __DIR__.'/../backend/src/bootstrap.php';
foreach(glob(__DIR__.'/../backend/migrations/*.sql')as$file)db()->exec(file_get_contents($file));
function seed(string $role,string $email):array{$id=id();$token=id();query('INSERT INTO users (id,name,email,password_hash,role,referral_code,created_at) VALUES (?,?,?,?,?,?,?)',[$id,$role==='admin'?'QA Administrator':'QA Customer',$email,password_hash('QA-test-password',PASSWORD_DEFAULT),$role,id(),now()]);query('INSERT INTO wallets (user_id,balance_cents) VALUES (?,?)',[$id,2000]);query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',[hash('sha256',$token),$id,'2099-01-01 00:00:00']);return ['id'=>$id,'token'=>$token];}
$a=seed('admin','admin@example.invalid');$u=seed('customer','customer@example.invalid');
for($i=0;$i<22;$i++)seed('customer','customer-'.$i.'@example.invalid');
$number=id();query('INSERT INTO orders (id,user_id,provider,product,service,phone,sms_code,status,price_cents,price_tier,idempotency_key,request_hash,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$number,$u['id'],'textverified','usa','google','12025550123','001234','completed',320,'retail',id(),'hash',now(),now(),'2099-01-01 00:00:00']);
$smm=id();query('INSERT INTO smm_orders (id,user_id,service,service_name,target,quantity,price_cents,status,refill_supported,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[$smm,$u['id'],'101','Instagram Likes','https://example.com/profile',100,100,'completed',1,now()]);
$inbox=id();query('INSERT INTO inboxes (id,user_id,address,provider_id,status,price_cents,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[$inbox,$u['id'],'test@example.invalid','test-mailbox','active',70,'2099-01-01 00:00:00',now()]);
$ad=id();query('INSERT INTO ads (id,user_id,title,target_url,banner_file,banner_mime,request_hash,idempotency_key,price_cents,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[$ad,$u['id'],'QA Banner','https://example.com','qa.png','image/png','hash',id(),1000,'active',now(),'2099-01-01 00:00:00']);
$payment=id();query('INSERT INTO payments (id,user_id,provider,amount_cents,currency,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',[$payment,$u['id'],'stripe',1000,'USD','successful',now(),now()]);
$support=id();query('INSERT INTO support_tickets (id,user_id,issue_type,payment_reference,description,attachment,mime,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[$support,$u['id'],'topup','qa-payment','Need help','qa.png','image/png','pending_email',now()]);
$rental=id();query('INSERT INTO orders (id,user_id,provider,provider_order_id,product,service,phone,status,price_cents,price_tier,idempotency_key,request_hash,created_at,updated_at,expires_at,rental_duration,rental_refundable) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$rental,$u['id'],'textverified','rental-qa','long-term','google','12025550124','active',340,'retail',id(),'hash',now(),now(),'2099-01-01 00:00:00','sevenDay',1]);
$rentalOperation=id();query('INSERT INTO fulfilment_intents (id,user_id,product,operation,resource_id,request_hash,idempotency_key,price_cents,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$rentalOperation,$u['id'],'long-term','renewal',$rental,'hash',id(),340,'reconciliation',now(),now()]);
echo json_encode(['admin'=>$a,'customer'=>$u,'number'=>$number,'rental'=>$rental,'inbox'=>$inbox,'ad'=>$ad,'support'=>$support,'payment'=>$payment]);

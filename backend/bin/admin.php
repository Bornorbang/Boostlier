<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';
$email=$argv[1]??'';if(!filter_var($email,FILTER_VALIDATE_EMAIL)){fwrite(STDERR,"Usage: php bin/admin.php registered-account@example.com\n");exit(1);}$u=one('SELECT id FROM users WHERE email=?',[$email]);if(!$u){fwrite(STDERR,"Register the account first.\n");exit(1);}query("UPDATE users SET role='admin' WHERE id=?",[$u['id']]);audit('admin_promoted',$u['id']);echo "Administrator role granted.\n";

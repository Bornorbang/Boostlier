<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';foreach(['Wallet','Pricing','Providers','Rentals','Commerce','Reconciliation']as$file)require __DIR__.'/../src/'.$file.'.php';
if(isset($argv[1])){try{echo json_encode(Reconciliation::run($argv[1])).PHP_EOL;exit(0);}catch(Problem $e){fwrite(STDERR,$e->key.': '.$e->getMessage().PHP_EOL);exit(1);}}
foreach(all("SELECT id,user_id,provider,provider_order_id,status,price_cents,created_at FROM orders WHERE status IN ('pending','reconciliation') ORDER BY created_at LIMIT 100")as$o)echo json_encode($o).PHP_EOL;
foreach(all("SELECT id,user_id,product,operation,status,price_cents,created_at FROM fulfilment_intents WHERE status IN ('pending','reconciliation') ORDER BY created_at LIMIT 100")as$i)echo json_encode($i).PHP_EOL;
echo "Usage: php bin/reconcile.php <intent-id>. Only a saved trusted receipt or authoritative provider lookup can attach/release.\n";

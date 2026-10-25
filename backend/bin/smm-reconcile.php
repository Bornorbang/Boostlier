<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';
foreach(['Wallet','Pricing','Providers','Commerce','SmmOrders']as$file)require_once __DIR__.'/../src/'.$file.'.php';
try {
    $action=$argv[1]??'';$intentId=$argv[2]??'';$file=$argv[3]??'';
    if(!in_array($action,['attach','release'],true)||!is_file($file)){
        fwrite(STDERR,"Usage: php bin/smm-reconcile.php attach|release <intent-id> <private-reviewed-evidence.json>\n");exit(1);
    }
    $intent=one("SELECT * FROM fulfilment_intents WHERE id=? AND product='smm'",[$intentId]);
    if(!$intent)fail('NOT_FOUND','Intent not found.',404);
    if(!in_array($intent['status'],['pending','reconciliation'],true))fail('INTENT_CLOSED','This intent has already been settled.',409);
    $input=json_decode($intent['request_payload']??'{}',true,32,JSON_THROW_ON_ERROR);
    $evidence=json_decode(file_get_contents($file),true,32,JSON_THROW_ON_ERROR);
    $reviewer=required($evidence,'reviewed_by',120);$note=required($evidence,'note',1000);
    if(($evidence['verified_in_provider_account']??false)!==true||(string)($evidence['service']??'')!==(string)$input['service']||($evidence['target']??'')!==$input['target']||(int)($evidence['quantity']??0)!==(int)$input['quantity'])fail('EVIDENCE_MISMATCH','Evidence must confirm the exact service, target and quantity in the provider account.',409);
    $details=['intent_id'=>$intentId,'reviewer'=>$reviewer,'note'=>$note,'evidence_sha256'=>hash_file('sha256',$file)];
    if($action==='attach'){
        $providerId=required($evidence,'provider_order_id',120);
        if(!ctype_digit($providerId))fail('INVALID_RECEIPT','Use the numeric provider order identifier.');
        $provider=new SmmProvider();$status=$provider->action($providerId,'status');
        if($status['status']==='reconciliation')fail('UNCONFIRMED_OUTCOME','Provider order status requires further review.',409);
        $quote=$input['_provider_quote']??[];
        $receipt=['id'=>$providerId,'service_name'=>$quote['name']??$input['service'],'refill'=>!empty($quote['refill'])];
        query('UPDATE fulfilment_intents SET receipt=?,updated_at=? WHERE id=?',[json_encode($receipt),now(),$intentId]);
        Commerce::activate($intentId,$receipt,$input);
        audit('smm_receipt_attached',null,$details+['provider_order_id'=>$providerId]);
        echo "Verified provider receipt attached; the original accepted USD amount was captured once.\n";
    }else{
        if(($evidence['confirmed_not_provisioned']??false)!==true)fail('UNCONFIRMED_OUTCOME','An explicit verified no-order outcome is required.',409);
        tx(function()use($intentId,$details){$row=one('SELECT * FROM fulfilment_intents WHERE id=?'.lockSuffix(),[$intentId]);if(!in_array($row['status'],['pending','reconciliation'],true))fail('INTENT_CLOSED','Intent already settled.',409);Wallet::change($row['user_id'],'release',0,'commerce-release:'.$intentId,'Operator verified no SMM provisioning',-(int)$row['price_cents']);query("UPDATE fulfilment_intents SET status='rejected',updated_at=? WHERE id=?",[now(),$intentId]);audit('smm_unprovisioned_released',null,$details);});
        echo "Verified unprovisioned reservation released once.\n";
    }
}catch(Problem $error){fwrite(STDERR,$error->key.': '.$error->getMessage().PHP_EOL);exit(1);}catch(\Throwable){fwrite(STDERR,"Reconciliation could not complete; inspect the intent before retrying.\n");exit(1);}

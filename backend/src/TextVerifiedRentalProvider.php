<?php
declare(strict_types=1);
namespace TempNumber;
require_once __DIR__.'/TextVerifiedProvider.php';

final class TextVerifiedRentalProvider implements ProductProvider
{
    public const DURATIONS=['oneDay'=>'1 day','threeDay'=>'3 days','sevenDay'=>'7 days','fourteenDay'=>'14 days','thirtyDay'=>'30 days','ninetyDay'=>'90 days','oneYear'=>'1 year'];
    public function __construct(private ?TextVerifiedProvider $connection=null){$this->connection??=new TextVerifiedProvider();}
    private function request(string $method,string $url,?array $body=null,?string $intent=null):array{return $this->connection->rentalRequest($method,$url,$body,$intent);}
    private function matchesService(mixed $actual,string $service):bool
    {
        if(!is_string($actual))return false;
        if(strcasecmp($actual,$service)===0)return true;
        foreach($this->catalogue('long-term')['items']as$item)if($item['id']===$service)return strcasecmp($actual,$item['name'])===0;
        return false;
    }
    public function catalogue(string $product):array
    {
        $cached=one('SELECT payload FROM textverified_cache WHERE id=? AND expires_at>?',['rental-services',now()]);
        if($cached)return json_decode($cached['payload'],true);
        $rows=$this->request('GET','/api/pub/v2/services?numberType=mobile&reservationType=nonrenewable')['data'];
        if(!array_is_list($rows))fail('INVALID_PROVIDER_RESPONSE','Rental services could not be read.',503);
        $items=[];
        foreach($rows as$row){$id=$row['serviceName']??'';if(!is_string($id)||$id===''||strlen($id)>120||str_starts_with($id,'test_')||in_array($id,['allservices','servicenotlisted','servicenotlistedvoice'],true)||!in_array(strtolower((string)($row['capability']??'')),['sms','smsandvoicecombo'],true))continue;$items[]=['id'=>$id,'name'=>strip_tags((string)(($row['description']??'')?:$id))];}
        usort($items,fn($a,$b)=>strcasecmp($a['name'],$b['name']));$result=['items'=>$items,'durations'=>self::DURATIONS];
        tx(function()use($result){$payload=json_encode($result);$expires=gmdate('Y-m-d H:i:s',time()+300);if(one('SELECT id FROM textverified_cache WHERE id=?'.lockSuffix(),['rental-services']))query('UPDATE textverified_cache SET payload=?,expires_at=? WHERE id=?',[$payload,$expires,'rental-services']);else query('INSERT INTO textverified_cache (id,payload,expires_at) VALUES (?,?,?)',['rental-services',$payload,$expires]);});
        return $result;
    }
    public function quote(string $product,array $request,?array $resource):array
    {
        $service=$resource['service']??required($request,'service',120);$duration=required($request,'duration',24);
        if(!isset(self::DURATIONS[$duration]))fail('INVALID_DURATION','Choose a supported rental duration.');
        if(!in_array($service,array_column($this->catalogue('long-term')['items'],'id'),true))fail('SERVICE_UNAVAILABLE','Choose an available rental service.');
        if($resource){
            if($resource['provider']!=='textverified'||$resource['status']!=='active'||empty($resource['expires_at'])||$resource['expires_at']<=now())fail('RENTAL_EXPIRED','Only an active rental can be extended.');
            $detail=$this->details($resource['provider_order_id']);
            if(strtolower($detail['state']??'')!=='nonrenewableactive'||strtotime($detail['endsAt']??'')<=time())fail('RENTAL_EXPIRED','This rental is no longer active.');
            if(!$this->matchesService($detail['serviceName']??null,$service)||($detail['number']??'')!==$resource['phone'])fail('INVALID_PROVIDER_RESPONSE','The provider returned different rental details.',503);
        }else{
            $stock=$this->request('POST','/api/pub/v2/inventory/rentals',['duration'=>$duration,'numberType'=>'mobile','serviceName'=>$service,'capability'=>'sms'])['data']['availableQuantity']??null;
            if(!is_int($stock)||$stock<0)fail('INVALID_PROVIDER_RESPONSE','Rental availability could not be confirmed.',503);
            if($stock===0)fail('OUT_OF_STOCK','No rentals are available for this service and duration.');
        }
        $pricing=$this->request('POST','/api/pub/v2/pricing/rentals',['serviceName'=>$service,'numberType'=>'mobile','capability'=>'sms','areaCode'=>false,'isRenewable'=>false,'duration'=>$duration])['data'];
        if(($pricing['serviceName']??'')!==$service)fail('INVALID_PROVIDER_RESPONSE','The rental quote did not match this service.',503);
        $cost=TextVerifiedProvider::cents($pricing['price']??null);if($cost<1)fail('INVALID_PROVIDER_PRICE','Rental pricing is unavailable.',503);
        return ['currency'=>'USD','cost_minor'=>$cost,'service'=>$service,'duration'=>$duration,'original_expiry'=>$resource?gmdate('Y-m-d H:i:s',strtotime($detail['endsAt'])):null,'provider_id'=>$resource['provider_order_id']??null,'phone'=>$resource['phone']??null];
    }
    private function save(string $intent,array $changes):void
    {
        $fields=[];$values=[];foreach($changes as$k=>$v){if(!in_array($k,['state','details_href','receipt'],true))continue;$fields[]=$k.'=?';$values[]=$v;}$fields[]='updated_at=?';$values[]=now();$values[]=$intent;query('UPDATE number_rental_requests SET '.implode(',',$fields).' WHERE intent_id=?',$values);
    }
    public function fulfil(string $intent,string $operation,array $quote,?array $resource):array
    {
        $record=one('SELECT * FROM number_rental_requests WHERE intent_id=?',[$intent]);
        if(!$record){
            $body=$operation==='renewal'?['rentalId'=>$quote['provider_id'],'extensionDuration'=>$quote['duration']]:['allowBackOrderReservations'=>false,'duration'=>$quote['duration'],'isRenewable'=>false,'numberType'=>'mobile','serviceName'=>$quote['service'],'capability'=>'sms'];
            query('INSERT INTO number_rental_requests (intent_id,operation,request_payload,state,created_at,updated_at) VALUES (?,?,?,?,?,?)',[$intent,$operation,json_encode(['body'=>$body,'quote'=>$quote]),'ready',now(),now()]);
            $record=one('SELECT * FROM number_rental_requests WHERE intent_id=?',[$intent]);
        }
        if($record['receipt'])return json_decode($record['receipt'],true);
        if($record['state']==='rejected')throw new NumberProviderRejected('PROVIDER_REJECTED','The provider rejected this rental request.');
        $stored=json_decode($record['request_payload'],true);$quote=$stored['quote'];$body=$stored['body'];
        if($operation==='renewal'){
            // This endpoint has no documented idempotency guarantee. Never replay an uncertain extension.
            $claimed=query("UPDATE number_rental_requests SET state='dispatched',updated_at=? WHERE intent_id=? AND state='ready'",[now(),$intent]);
            if($claimed->rowCount()!==1){
                $detail=$this->details($quote['provider_id']);
                $days=match($quote['duration']){'oneDay'=>1,'threeDay'=>3,'sevenDay'=>7,'fourteenDay'=>14,'thirtyDay'=>30,'ninetyDay'=>90,'oneYear'=>365};
                $delta=strtotime($detail['endsAt']??'')-strtotime($quote['original_expiry']);
                $maximum=($quote['duration']==='oneYear'?366:$days)*86400;
                if(strtolower($detail['state']??'')!=='nonrenewableactive'||strtotime($detail['endsAt'])<=time()||!$this->matchesService($detail['serviceName']??null,$quote['service'])||($detail['number']??'')!==$quote['phone']||$delta<$days*86400||$delta>$maximum+1)fail('RECONCILIATION_REQUIRED','The extension outcome is not confirmed yet. Do not submit another extension.',409);
                $receipt=['id'=>$quote['provider_id'],'expires_at'=>gmdate('Y-m-d H:i:s',strtotime($detail['endsAt'])),'duration'=>$quote['duration'],'provider'=>'textverified','recovered_from_expiry'=>true];
                $this->save($intent,['receipt'=>json_encode($receipt),'state'=>'confirmed']);
                return $receipt;
            }
            try{$extension=$this->request('POST','/api/pub/v2/reservations/rentals/extensions',$body,$intent)['data'];}
            catch(NumberProviderRejected $e){$this->save($intent,['state'=>'rejected']);throw $e;}
            if(($extension['reservationId']??'')!==$quote['provider_id']||!strtotime($extension['newEndsAt']??'')||strtotime($extension['newEndsAt'])<=strtotime($quote['original_expiry']))throw new AmbiguousProvisioning('The extension receipt could not be verified.');
            $actual=TextVerifiedProvider::cents($extension['cost']??null);
            $receipt=['id'=>$quote['provider_id'],'expires_at'=>gmdate('Y-m-d H:i:s',strtotime($extension['newEndsAt'])),'duration'=>$quote['duration'],'provider'=>'textverified','cost_minor'=>$actual];
        }else{
            $href=$record['details_href'];
            if(!$href){
                try{$created=$this->request('POST','/api/pub/v2/reservations/rental',$body,$intent);}
                catch(NumberProviderRejected $e){$this->save($intent,['state'=>'rejected']);throw $e;}
                $href=TextVerifiedProvider::safeUrl($created['headers']['location']??$created['data']['href']??'');
                if(!str_starts_with(parse_url($href,PHP_URL_PATH),'/api/pub/v2/sales/'))throw new AmbiguousProvisioning('Expected a rental sale link.');
                $this->save($intent,['state'=>'acknowledged','details_href'=>$href]);
            }
            $sale=$this->request('GET',$href)['data'];
            if(!is_string($sale['id']??null)||parse_url($href,PHP_URL_PATH)!=='/api/pub/v2/sales/'.rawurlencode($sale['id']))throw new AmbiguousProvisioning('The rental sale identifier could not be verified.');
            if(strtolower($sale['state']??'')==='failed'){$this->save($intent,['state'=>'rejected']);throw new NumberProviderRejected('PROVIDER_REJECTED','The rental purchase failed. Reserved funds have been released.');}
            if(strtolower($sale['state']??'')!=='succeeded'||count($sale['reservations']??[])!==1||!empty($sale['backOrderReservations']))throw new AmbiguousProvisioning('The rental sale remains pending.');
            $reservation=$sale['reservations'][0];
            if(!$this->matchesService($reservation['serviceName']??null,$quote['service'])||strtolower($reservation['reservationType']??'')!=='nonrenewable')throw new AmbiguousProvisioning('The rental sale returned different options.');
            $rentalHref=TextVerifiedProvider::safeUrl($reservation['link']['href']??'');
            $reservationId=$reservation['id']??null;
            if(!is_string($reservationId)||!preg_match('/^[a-zA-Z0-9_-]{1,120}$/D',$reservationId))throw new AmbiguousProvisioning('Invalid rental identifier.');
            $rentalPath=parse_url($rentalHref,PHP_URL_PATH);parse_str(parse_url($rentalHref,PHP_URL_QUERY)??'',$rentalQuery);
            $specific=$rentalPath==='/api/pub/v2/reservations/rental/nonrenewable/'.rawurlencode($reservationId)&&!$rentalQuery;
            $generic=$rentalPath==='/api/pub/v2/reservations/'.rawurlencode($reservationId)&&count($rentalQuery)===1&&strtolower((string)($rentalQuery['type']??''))==='nonrenewable';
            if(!$specific&&!$generic)throw new AmbiguousProvisioning('Unexpected rental detail link.');
            // Generic reservation links return a second Link object. Read the documented
            // nonrenewable detail endpoint directly once its ID/type have been verified.
            $detail=$generic?$this->details($reservationId):$this->request('GET',$rentalHref)['data'];
            if(($detail['id']??'')===$reservationId&&$this->matchesService($detail['serviceName']??null,$quote['service'])&&strtolower($detail['state']??'')==='nonrenewablerefunded'){
                $this->save($intent,['state'=>'rejected']);
                throw new NumberProviderRejected('PROVIDER_REJECTED','The provider has refunded this rental. Reserved funds have been released.');
            }
            if(($detail['id']??'')!==$reservation['id']||!$this->matchesService($detail['serviceName']??null,$quote['service'])||!preg_match('/^\+?\d{10,15}$/D',$detail['number']??'')||!strtotime($detail['endsAt']??'')||strtolower($detail['state']??'')!=='nonrenewableactive')throw new AmbiguousProvisioning('The assigned rental could not be confirmed.');
            $actual=TextVerifiedProvider::cents($sale['total']??null);
            $receipt=['id'=>$detail['id'],'phone'=>$detail['number'],'expires_at'=>gmdate('Y-m-d H:i:s',strtotime($detail['endsAt'])),'duration'=>$quote['duration'],'provider'=>'textverified','details_href'=>$rentalHref,'refundable'=>!empty($detail['refund']['canRefund']),'cost_minor'=>$actual];
        }
        // Customers are charged only their accepted quote; an upstream increase is retained for review.
        $this->save($intent,['receipt'=>json_encode($receipt),'state'=>'confirmed']);
        return $receipt;
    }
    public function findIntent(string $intent):array
    {
        $record=one('SELECT * FROM number_rental_requests WHERE intent_id=?',[$intent]);
        if(!$record)fail('RECONCILIATION_REQUIRED','This rental request needs operator review.',409);
        if($record['state']==='rejected')return ['authoritative'=>true,'outcome'=>'not_provisioned'];
        if($record['receipt'])return ['authoritative'=>true,'outcome'=>'provisioned','receipt'=>json_decode($record['receipt'],true)];
        $stored=json_decode($record['request_payload'],true);
        try{return ['authoritative'=>true,'outcome'=>'provisioned','receipt'=>$this->fulfil($intent,$record['operation'],$stored['quote'],null)];}
        catch(NumberProviderRejected){return ['authoritative'=>true,'outcome'=>'not_provisioned'];}
    }
    public function details(string $id):array
    {
        if(!preg_match('/^[a-zA-Z0-9_-]{1,120}$/D',$id))fail('INVALID_RENTAL','Invalid rental identifier.');
        $detail=$this->request('GET','/api/pub/v2/reservations/rental/nonrenewable/'.rawurlencode($id))['data'];
        if(($detail['id']??'')!==$id)fail('INVALID_PROVIDER_RESPONSE','The provider returned a different rental.',503);
        if(!is_string($detail['serviceName']??null)||!is_string($detail['number']??null)||!preg_match('/^\+?[0-9]{7,16}$/D',$detail['number'])||!is_string($detail['endsAt']??null)||strtotime($detail['endsAt'])===false)fail('INVALID_PROVIDER_RESPONSE','The provider returned incomplete rental details.',503);
        return $detail;
    }
    public function action(string $providerId,string $action):array
    {
        $detail=$this->details($providerId);
        if($action==='cancel'){
            if(strtolower($detail['state']??'')!=='nonrenewablerefunded'){
                if(empty($detail['refund']['canRefund']))fail('REFUND_UNAVAILABLE','This rental is outside its cancellation/refund window.');
                $this->request('POST','/api/pub/v2/reservations/rental/nonrenewable/'.rawurlencode($providerId).'/refund');
                $detail=$this->details($providerId);
            }
        }elseif($action!=='status')fail('ACTION_UNAVAILABLE','Unsupported rental action.');
        $state=match(strtolower($detail['state']??'')){'nonrenewableactive'=>'active','nonrenewableexpired'=>'expired','nonrenewablerefunded'=>'cancelled',default=>'reconciliation'};
        $result=['authoritative'=>true,'status'=>$state,'refundable'=>!empty($detail['refund']['canRefund']),'expires_at'=>isset($detail['endsAt'])?gmdate('Y-m-d H:i:s',strtotime($detail['endsAt'])):null];
        if($state==='cancelled'){$row=one("SELECT price_cents FROM orders WHERE provider='textverified' AND product='long-term' AND provider_order_id=?",[$providerId]);$result+=['financial_final'=>true,'refund_cents'=>(int)($row['price_cents']??0)];}
        return $result;
    }
    public function messages(string $providerId):array
    {
        $detail=$this->details($providerId);
        if(strtolower($detail['state']??'')!=='nonrenewableactive'||strtotime($detail['endsAt']??'')<=time())fail('RENTAL_EXPIRED','This rental is no longer active.');
        $url='/api/pub/v2/sms?'.http_build_query(['reservationId'=>$providerId,'reservationType'=>'nonrenewable']);$items=[];
        for($page=0;$page<5;$page++){
            $data=$this->request('GET',$url)['data'];if(!is_array($data['data']??null))fail('INVALID_PROVIDER_RESPONSE','The rental inbox could not be read.',503);
            foreach($data['data']as$message){if(($message['to']??'')!==($detail['number']??''))fail('INVALID_PROVIDER_RESPONSE','A message belongs to a different number.',503);$items[]=['id'=>(string)($message['id']??''),'sender'=>strip_tags((string)($message['from']??'')),'text'=>!empty($message['encrypted'])?'Encrypted message unavailable.':strip_tags((string)($message['smsContent']??'')),'code'=>!empty($message['encrypted'])?null:($message['parsedCode']??null),'created_at'=>$message['createdAt']??null];}
            if(empty($data['hasNext']))return $items;
            $url=TextVerifiedProvider::safeUrl($data['links']['next']['href']??'');parse_str(parse_url($url,PHP_URL_QUERY)??'',$query);
            if(parse_url($url,PHP_URL_PATH)!=='/api/pub/v2/sms'||($query['reservationId']??'')!==$providerId||($query['reservationType']??'')!=='nonrenewable')fail('INVALID_PROVIDER_RESPONSE','Invalid inbox pagination link.',503);
        }
        fail('INBOX_TOO_LARGE','This inbox has more messages than can be shown in one request. Contact support.',409);
    }
    public function message(string $providerId,string $messageId):array{foreach($this->messages($providerId)as$message)if($message['id']===$messageId)return $message;fail('NOT_FOUND','Message not found in this rental.',404);}
    public function delete(string $providerId):bool{fail('ACTION_UNAVAILABLE','Rentals use provider-supported cancellation, not deletion.');}
}

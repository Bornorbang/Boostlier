<?php
declare(strict_types=1);
namespace TempNumber;

final class FiveSimProvider implements NumberProvider
{
    private ?\Closure $transport;
    public function __construct(?callable $transport=null){$this->transport=$transport?\Closure::fromCallable($transport):null;}
    private static function segment(string $value):string{if(!preg_match('/^[a-z0-9_-]{1,80}$/D',$value))fail('INVALID_SELECTION','Choose a valid country and service.');return $value;}
    public static function cents(mixed $value):int
    {
        if(is_float($value)){if(!is_finite($value))fail('INVALID_PROVIDER_PRICE','Invalid provider price.',503);$value=rtrim(rtrim(sprintf('%.8F',$value),'0'),'.');}
        if(is_int($value))$value=(string)$value;
        if(!is_string($value)||!preg_match('/^\d{1,8}(?:\.\d{1,8})?$/D',$value))fail('INVALID_PROVIDER_PRICE','Invalid provider price.',503);
        $scaled=bcmul($value,'100',8);$floor=bcdiv($scaled,'1',0);return (int)$floor+(bccomp($scaled,$floor,8)>0?1:0);
    }
    public function request(string $path,bool $authenticated=false,bool $purchase=false):array
    {
        if(!preg_match('~^/(?:guest|user)/[a-zA-Z0-9_/?=&.%-]+$~D',$path)||str_contains($path,'..'))fail('INVALID_PROVIDER_LINK','Invalid 5sim request.');
        if($authenticated&&!$this->transport&&!env('FIVESIM_API_KEY'))fail('PROVIDER_UNAVAILABLE','Global numbers are not connected.',503);
        if($this->transport)$result=($this->transport)($path,$authenticated);
        else{
            try{rateLimit('fivesim-provider',90,60);}catch(Problem$e){if($purchase)throw new NumberProviderRejected('PROVIDER_REJECTED','The purchase was not dispatched. Please try again shortly.');throw $e;}
            $headers=['Accept: application/json'];if($authenticated)$headers[]='Authorization: Bearer '.env('FIVESIM_API_KEY');
            $c=curl_init('https://5sim.net/v1'.$path);curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>16,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_HTTPHEADER=>$headers]);
            if(PHP_OS_FAMILY==='Windows'&&defined('CURLSSLOPT_NATIVE_CA'))curl_setopt($c,CURLOPT_SSL_OPTIONS,CURLSSLOPT_NATIVE_CA);
            $raw=curl_exec($c);$http=(int)curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
            if(!is_string($raw)||!$http){if($purchase)throw new AmbiguousProvisioning('5sim purchase response was lost.');fail('PROVIDER_UNAVAILABLE','Global number status is temporarily unavailable.',503);}
            $result=['http'=>$http,'raw'=>$raw,'data'=>json_decode($raw,true)];
        }
        $http=$result['http']??0;$raw=strtolower(trim((string)($result['raw']??'')));
        if($purchase&&(($http===200&&$raw==='no free phones')||($http===400&&in_array($raw,['not enough user balance','not enough rating','select country','select operator','bad country','bad operator','no product','server offline'],true))))throw new NumberProviderRejected('PROVIDER_REJECTED','This number could not be supplied. Reserved funds have been released.');
        if($http<200||$http>=300||!is_array($result['data']??null)){if($purchase)throw new AmbiguousProvisioning('5sim purchase needs confirmation.');fail('PROVIDER_UNAVAILABLE','5sim could not confirm this operation. The order has not been assumed to fail.',503);}
        return $result['data'];
    }
    private function cached(string $id,int $seconds,callable $fetch):array
    {
        if(!$this->transport){$saved=one('SELECT payload FROM fivesim_cache WHERE id=? AND expires_at>?',[$id,now()]);if($saved)return json_decode($saved['payload'],true);}
        $data=$fetch();$this->store($id,$data,$seconds);return $data;
    }
    private function store(string $id,array $data,int $seconds):void
    {
        tx(function()use($id,$data,$seconds){$values=[json_encode($data),gmdate('Y-m-d H:i:s',time()+$seconds),$id];if(one('SELECT id FROM fivesim_cache WHERE id=?'.lockSuffix(),[$id]))query('UPDATE fivesim_cache SET payload=?,expires_at=? WHERE id=?',$values);else query('INSERT INTO fivesim_cache (payload,expires_at,id) VALUES (?,?,?)',$values);});
    }
    public function services():array
    {
        return $this->cached('services',3600,function(){
            $rows=$this->request('/guest/products/any/any');$items=[];
            foreach($rows as$id=>$row)if(is_array($row)&&($row['Category']??$row['category']??'')==='activation'&&preg_match('/^[a-z0-9_-]{1,80}$/D',(string)$id))$items[]=['id'=>(string)$id,'name'=>ucfirst((string)$id)];
            usort($items,fn($a,$b)=>strcasecmp($a['name'],$b['name']));return $items;
        });
    }
    public function countries():array{return $this->cached('countries',3600,fn()=>$this->request('/guest/countries'));}
    private function offers(string $service,?string $country=null,bool $fresh=false):array
    {
        self::segment($service);if($country!==null)self::segment($country);
        $fetch=fn()=>$this->request('/guest/prices?'.http_build_query(['product'=>$service]+($country!==null?['country'=>$country]:[])));
        $raw=$fresh?$fetch():$this->cached('prices:'.$service,20,$fetch);
        // The product-only endpoint is product -> country -> operator. With both
        // parameters it is country -> product -> operator (confirmed live).
        if($country!==null)return [$country=>$raw[$country][$service]??$raw[$service][$country]??[]];
        return isset($raw[$service])&&is_array($raw[$service])?$raw[$service]:[];
    }
    public static function best(array $operators):?array
    {
        $best=null;
        foreach($operators as$operator=>$row){
            if(!is_array($row)||!preg_match('/^[a-z0-9_-]{1,80}$/D',(string)$operator)||$operator==='any'||!is_int($row['count']??null)||$row['count']<1||!is_numeric($row['rate']??null))continue;
            $rate=(float)$row['rate'];if(!is_finite($rate)||$rate<=0||$rate>100)continue;
            try{$cost=self::cents($row['cost']??null);}catch(Problem){continue;}if($cost<1)continue;
            $item=['operator'=>(string)$operator,'success_rate'=>$rate,'cost_minor'=>$cost,'stock'=>$row['count']];
            if($best===null||$rate>$best['success_rate']||($rate===$best['success_rate']&&($cost<$best['cost_minor']||($cost===$best['cost_minor']&&strcmp($item['operator'],$best['operator'])<0))))$best=$item;
        }
        return $best;
    }
    public function catalogue(string $country):array{return ['currency'=>'USD','items'=>$this->services()];}
    public function prices(string $service,array $config):array
    {
        query('DELETE FROM fivesim_cache WHERE expires_at<=?',[now()]);
        if(!in_array($service,array_column($this->services(),'id'),true))fail('SERVICE_UNAVAILABLE','Choose an available global service.');
        $countries=$this->countries();$items=[];
        foreach($this->offers($service)as$country=>$operators){
            if(!isset($countries[$country])||!is_array($operators))continue;$best=self::best($operators);if(!$best)continue;
            $iso=strtoupper((string)array_key_first($countries[$country]['iso']??[]));
            $quote=$best+['service'=>$service,'country'=>$country,'currency'=>'USD','country_code'=>preg_match('/^[A-Z]{2}$/D',$iso)?$iso:null];
            $id=bin2hex(random_bytes(16));$this->store('quote:'.$id,$quote,120);
            $items[]=['country'=>$country,'country_name'=>strip_tags((string)($countries[$country]['text_en']??ucfirst($country))),'country_code'=>$quote['country_code'],'service'=>$service,'operator'=>$best['operator'],'success_rate'=>$best['success_rate'],'stock'=>$best['stock'],'price_usd'=>money(Pricing::numberQuote($best['cost_minor'],'5sim',$config)),'quote_id'=>$id];
        }
        usort($items,fn($a,$b)=>strcasecmp($a['country_name'],$b['country_name']));
        $best=$items;usort($best,fn($a,$b)=>($b['success_rate']<=>$a['success_rate'])?:(cents($a['price_usd'])<=>cents($b['price_usd']))?:strcasecmp($a['country_name'],$b['country_name']));
        return ['items'=>$items,'best_country'=>$best[0]['country']??null,'currency'=>'USD'];
    }
    public function quote(string $service,string $country,array $options):array
    {
        if(!$this->transport&&!env('FIVESIM_API_KEY'))fail('PROVIDER_UNAVAILABLE','Global numbers are not connected.',503);
        self::segment($country);self::segment($service);
        if(array_diff(array_keys($options),['quote_id']))fail('UNSUPPORTED_OPTIONS','Choose a quoted global number.');
        $id=$options['quote_id']??'';if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))fail('QUOTE_REQUIRED','Refresh the global number prices before purchasing.');
        $record=one('SELECT payload FROM fivesim_cache WHERE id=? AND expires_at>?',['quote:'.$id,now()]);if(!$record)fail('QUOTE_EXPIRED','This quote expired. Refresh the country list.');$quoted=json_decode($record['payload'],true);
        if($quoted['country']!==$country||$quoted['service']!==$service)fail('QUOTE_MISMATCH','The quote belongs to a different country or service.');
        $offers=$this->offers($service,$country,true);$best=self::best($offers[$country]??[]);if(!$best)fail('OUT_OF_STOCK','No number with a published success rate is currently available.');
        if($best['operator']!==$quoted['operator']||$best['cost_minor']>$quoted['cost_minor'])fail('QUOTE_CHANGED','The best available offer changed. Refresh the list before purchasing.');
        return array_replace($quoted,$best);
    }
    public function purchase(string $intent,array $quote):array
    {
        $record=one('SELECT * FROM fivesim_requests WHERE intent_id=?',[$intent]);
        if(!$record){query('INSERT INTO fivesim_requests (intent_id,request_payload,state,created_at,updated_at) VALUES (?,?,?,?,?)',[$intent,json_encode($quote),'ready',now(),now()]);$record=one('SELECT * FROM fivesim_requests WHERE intent_id=?',[$intent]);}
        if($record['receipt'])return json_decode($record['receipt'],true);
        if($record['state']==='rejected')throw new NumberProviderRejected('PROVIDER_REJECTED','5sim rejected the purchase.');
        $claim=query("UPDATE fivesim_requests SET state='dispatched',updated_at=? WHERE intent_id=? AND state='ready'",[now(),$intent]);
        if($claim->rowCount()!==1)throw new AmbiguousProvisioning('An uncertain 5sim purchase must not be dispatched twice.');
        $quote=json_decode($record['request_payload'],true);
        try{$data=$this->request('/user/buy/activation/'.self::segment($quote['country']).'/'.self::segment($quote['operator']).'/'.self::segment($quote['service']),true,true);}
        catch(NumberProviderRejected$e){query("UPDATE fivesim_requests SET state='rejected',updated_at=? WHERE intent_id=?",[now(),$intent]);throw $e;}
        query('UPDATE fivesim_requests SET provider_response=?,updated_at=? WHERE intent_id=?',[json_encode($data),now(),$intent]);
        $receipt=$this->purchaseReceipt($data,$quote);
        query("UPDATE fivesim_requests SET receipt=?,state='confirmed',updated_at=? WHERE intent_id=?",[json_encode($receipt),now(),$intent]);return $receipt;
    }
    private function purchaseReceipt(array $data,array $quote):array
    {
        $id=$data['id']??null;
        if((!is_int($id)&&!is_string($id))||!ctype_digit((string)$id)||($data['country']??null)!==$quote['country']||($data['product']??null)!==$quote['service']||($data['operator']??null)!==$quote['operator']||!is_string($data['phone']??null)||!preg_match('/^\+?[0-9]{7,16}$/D',$data['phone'])||!is_string($data['expires']??null)||!strtotime($data['expires'])||!in_array($data['status']??'',['PENDING','RECEIVED','FINISHED'],true))throw new AmbiguousProvisioning('The assigned global number could not be verified.');
        $actual=self::cents($data['price']??null);
        return ['id'=>(string)$id,'phone'=>$data['phone'],'expires_at'=>gmdate('Y-m-d H:i:s',strtotime($data['expires'])),'provider'=>'5sim','country_code'=>$quote['country_code']??null,'operator'=>$quote['operator'],'success_rate'=>$quote['success_rate'],'cost_minor'=>$actual,'can_cancel'=>(in_array($data['status'],['PENDING','RECEIVED'],true)&&empty($data['sms'])),'provider_state'=>$data['status']];
    }
    public function findIntent(string $intent):array
    {
        $record=one('SELECT * FROM fivesim_requests WHERE intent_id=?',[$intent]);if(!$record)fail('RECONCILIATION_REQUIRED','The global number request needs review.',409);
        if($record['receipt'])return ['authoritative'=>true,'outcome'=>'provisioned','receipt'=>json_decode($record['receipt'],true)];
        if($record['state']==='rejected')return ['authoritative'=>true,'outcome'=>'not_provisioned'];
        if($record['provider_response']){$receipt=$this->purchaseReceipt(json_decode($record['provider_response'],true),json_decode($record['request_payload'],true));query("UPDATE fivesim_requests SET receipt=?,state='confirmed',updated_at=? WHERE intent_id=?",[json_encode($receipt),now(),$intent]);return ['authoritative'=>true,'outcome'=>'provisioned','receipt'=>$receipt];}
        fail('RECONCILIATION_REQUIRED','The provider response was interrupted. Support must verify this order; it will not be purchased again automatically.',409);
    }
    private function order(string $providerId):array
    {
        if(!ctype_digit($providerId)||strlen($providerId)>20)fail('INVALID_ORDER','Invalid global order identifier.');
        $row=one("SELECT * FROM orders WHERE provider='5sim' AND provider_order_id=?",[$providerId]);if(!$row)fail('NOT_FOUND','Global number not found.',404);return $row;
    }
    private function parse(array $data,array $order):array
    {
        $metadata=json_decode($order['provider_metadata']??'{}',true);
        if((string)($data['id']??'')!==$order['provider_order_id']||($data['phone']??null)!==$order['phone']||($data['product']??null)!==$order['service']||($data['country']??null)!==$order['country']||(isset($data['operator'])&&$data['operator']!==($metadata['operator']??null)))fail('INVALID_PROVIDER_RESPONSE','5sim returned different order details.',503);
        $sms=$data['sms']??[];if(!is_array($sms)||!array_is_list($sms))fail('INVALID_PROVIDER_RESPONSE','SMS could not be read.',503);$code='';$messages=[];
        foreach($sms as$index=>$message){if(!is_array($message)||isset($message['code'])&&!is_string($message['code']))fail('INVALID_PROVIDER_RESPONSE','Invalid SMS code format.',503);if(!empty($message['code']))$code=$message['code'];if(is_string($message['text']??null))$messages[]=['id'=>hash('sha256',json_encode([$message['date']??$message['created_at']??null,$message['text'],$message['code']??null])),'body'=>strip_tags($message['text'])];}
        $state=$data['status']??'UNKNOWN';$status=match($state){'PENDING','RECEIVED'=>'active','CANCELED','BANNED'=>'cancelled','TIMEOUT'=>'expired',default=>'reconciliation'};if($code!=='')$status='completed';
        return ['authoritative'=>true,'status'=>$status,'provider_state'=>$state,'can_cancel'=>in_array($state,['PENDING','RECEIVED'],true)&&$sms===[],'sms_code'=>$code,'messages'=>$messages,'no_sms_confirmed'=>$sms===[]&&in_array($state,['CANCELED','BANNED','TIMEOUT'],true)];
    }
    public function status(string $providerId):array{$order=$this->order($providerId);return $this->parse($this->request('/user/check/'.$providerId,true),$order);}
    public function cancel(string $providerId):array
    {
        $order=$this->order($providerId);$before=$this->status($providerId);
        if(!$before['can_cancel']){
            if(in_array($before['status'],['cancelled','expired','completed'],true))return $before;
            fail('CANCELLATION_UNAVAILABLE','This number cannot currently be cancelled. An SMS may already have arrived. Refresh its status to check.',409);
        }
        try{$result=$this->parse($this->request('/user/cancel/'.$providerId,true),$order);}
        catch(Problem $error){
            // The number may expire, receive SMS, or cancel while the request is in flight.
            // Re-read before reporting a failure; never invent a successful cancellation.
            try{$latest=$this->status($providerId);}catch(Problem){throw $error;}
            if(in_array($latest['status'],['cancelled','expired','completed'],true))return $latest;
            throw $error;
        }
        if(!in_array($result['status'],['cancelled','expired','completed'],true)){
            $result=$this->status($providerId);
            if(!in_array($result['status'],['cancelled','expired','completed'],true))fail('CANCELLATION_UNCONFIRMED','Cancellation has not been confirmed. Please try again shortly; your number is still active.',409);
        }
        return $result;
    }
    public function finish(string $providerId):array{$order=$this->order($providerId);return $this->parse($this->request('/user/finish/'.$providerId,true),$order);}
}

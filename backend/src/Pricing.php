<?php
declare(strict_types=1);
namespace TempNumber;
final class Pricing {
 public static function setting(string $name):?array {$r=one('SELECT value FROM settings WHERE name=?',[$name]);return $r?json_decode($r['value'],true):null;}
 /** Exact integer conversion: cost minor units * USD cents per settlement minor unit as a rational. */
 public static function quote(int $cost,array $config,string $tier='retail',bool $smm=false):int {
  foreach(['currency','fx_numerator','fx_denominator','fx_updated_at'] as $field)if(empty($config[$field]))fail('PRICING_UNCONFIGURED','Commercial pricing requires configuration.',503);
  if($cost<0||(int)$config['fx_denominator']<=0||(int)$config['fx_numerator']<=0)fail('PRICING_UNCONFIGURED','Invalid pricing configuration.',503);
  if(strtotime($config['fx_updated_at'])===false||(($config['fx_mode']??'market')!=='fixed'&&strtotime($config['fx_updated_at'])<time()-86400))fail('PRICING_STALE','The exchange rate requires an update.',503);
  $ceil=static fn(string $top,string $bottom):string=>bcdiv(bcadd($top,bcsub($bottom,'1',0),0),$bottom,0);
  $top=bcmul((string)$cost,(string)$config['fx_numerator'],0);
  $converted=$ceil($top,(string)$config['fx_denominator']);
  $margin=$tier==='wholesale'?'wholesale_margin_cents':'retail_margin_cents';if(!isset($config[$smm?'markup_basis_points':$margin]))fail('PRICING_UNCONFIGURED','Margins require configuration.',503);
  $step=max(1,(int)($config['rounding_cents']??1));
  if($smm){$top=bcmul($top,bcadd('10000',(string)$config['markup_basis_points'],0),0);$bottom=bcmul((string)$config['fx_denominator'],'10000',0);$price=bcmul($ceil($top,bcmul($bottom,(string)$step,0)),(string)$step,0);}
  else{$price=bcadd($converted,(string)$config[$margin],0);$price=bcmul($ceil($price,(string)$step),(string)$step,0);}
  if(bccomp($price,'0')<0||bccomp($price,(string)PHP_INT_MAX)>0)fail('INVALID_PRICE','The quote exceeds the supported amount.',503);
  return max((int)($config['minimum_price_cents']??0),(int)$price);
 }
 public static function numberQuote(int $cost,string $source,array $config,string $tier='retail'):int {
  return self::quote($cost,$config,$tier);
 }
 public static function snapshot(string $catalogue,string $country,bool $wholesale=false):array {
  if($catalogue==='usa'&&env('TEXTVERIFIED_API_KEY')&&env('TEXTVERIFIED_API_USERNAME'))return ['items'=>[],'state'=>'unavailable','message'=>'Choose a service in Numbers to check current USD pricing and stock.'];
  if(!in_array($catalogue,['usa','global'],true))fail('INVALID_CATALOGUE','Choose USA or All Countries.');
  if($catalogue==='usa')$country='usa';$key=$catalogue.':'.$country.':'.($wholesale?'wholesale':'retail');$row=one('SELECT * FROM pricing_snapshots WHERE id=?',[$key]);
  if(!$row||strtotime($row['updated_at'])<time()-45){try{$source=$catalogue==='usa'?'getatext':'5sim';$config=self::setting($source.'_pricing');if(!$config)throw new \RuntimeException('Pricing unconfigured');$live=provider($source)->catalogue($country);if(($live['currency']??'')!==$config['currency'])throw new \RuntimeException('Currency mismatch');$items=[];foreach($live['items'] as $item)$items[]=['id'=>(string)$item['id'],'service'=>(string)$item['service'],'stock'=>(int)$item['stock'],'duration_minutes'=>isset($item['duration_minutes'])?(int)$item['duration_minutes']:null,'price_usd'=>money(self::quote((int)$item['cost_minor'],$config,$wholesale?'wholesale':'retail'))];$updated=now();tx(function()use($key,$items,$updated){$existing=one('SELECT id FROM pricing_snapshots WHERE id=?'.lockSuffix(),[$key]);if($existing)query('UPDATE pricing_snapshots SET payload=?,updated_at=? WHERE id=?',[json_encode($items),$updated,$key]);else query('INSERT INTO pricing_snapshots (id,payload,updated_at) VALUES (?,?,?)',[$key,json_encode($items),$updated]);});$row=['payload'=>json_encode($items),'updated_at'=>$updated];}catch(\Throwable){/* Never replace a previous successful snapshot with a provider error. */}}
  if(!$row)return ['items'=>[],'state'=>'unavailable','message'=>'Provider connection and commercial pricing are not configured. Live availability cannot be confirmed.'];
  return ['items'=>json_decode($row['payload'],true),'state'=>strtotime($row['updated_at'])<time()-45?'stale':'live','updated_at'=>str_replace(' ','T',$row['updated_at']).'Z'];
 }
}

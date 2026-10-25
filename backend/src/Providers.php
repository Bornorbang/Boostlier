<?php
declare(strict_types=1);
namespace TempNumber;
/** Integration boundary. Implement against the owner's supplied docs; never infer endpoints or billing currencies. */
interface NumberProvider {
 public function catalogue(string $country):array;
 public function quote(string $service,string $country,array $options):array;
 /** Throw AmbiguousProvisioning if the request may have reached the provider. */
 public function purchase(string $intent,array $quote):array;
 public function status(string $providerId):array;
 public function cancel(string $providerId):array;
 public function finish(string $providerId):array;
 public function findIntent(string $intent):array;
}
class AmbiguousProvisioning extends \RuntimeException {}
class NumberProviderRejected extends Problem {}
final class UnconfiguredProvider implements NumberProvider {
 public function catalogue(string $country):array {fail('PROVIDER_UNAVAILABLE','Live inventory is unavailable until the provider is connected.',503);}
 public function quote(string $service,string $country,array $options):array {fail('PROVIDER_UNAVAILABLE','This provider is not connected. No funds have been reserved.',503);}
 public function purchase(string $intent,array $quote):array {throw new AmbiguousProvisioning('Provider not connected.');}
 public function status(string $providerId):array {fail('PROVIDER_UNAVAILABLE','The provider cannot be reached. The order remains unchanged.',503);}
 public function cancel(string $providerId):array {fail('PROVIDER_UNAVAILABLE','Cancellation cannot be confirmed. No refund has been issued.',503);}
 public function finish(string $providerId):array {fail('PROVIDER_UNAVAILABLE','Finishing cannot be confirmed. The rental remains unchanged.',503);}
 public function findIntent(string $intent):array {fail('PROVIDER_UNAVAILABLE','Authoritative intent lookup is unavailable. Funds remain reserved.',503);}
}
function provider(string $source):NumberProvider {if($source==='textverified'){require_once __DIR__.'/TextVerifiedProvider.php';return new TextVerifiedProvider();}if($source==='5sim'){require_once __DIR__.'/FiveSimProvider.php';return new FiveSimProvider();}if(!in_array($source,['getatext'],true))fail('INVALID_PROVIDER','Unsupported provider.');return new UnconfiguredProvider();}

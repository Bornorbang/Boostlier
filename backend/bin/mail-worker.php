<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';
require __DIR__.'/../src/AccountMail.php';
$watch=in_array('--watch',$argv,true);
do {
 try { $summary=AccountMail::deliver();if(!$watch||array_sum($summary))echo json_encode($summary).PHP_EOL; }
 catch(\Throwable){fwrite(STDERR,"Account email worker failed; check database and configuration.\n");if(!$watch)exit(1);}
 if($watch)sleep(5);
}while($watch);

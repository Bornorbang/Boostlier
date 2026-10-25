<?php
declare(strict_types=1);
namespace TempNumber;
require __DIR__.'/../src/bootstrap.php';
db()->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME NOT NULL)');
foreach(glob(__DIR__.'/../migrations/*.sql') as $file){$version=basename($file);if(one('SELECT version FROM schema_migrations WHERE version=?',[$version]))continue;$sql=file_get_contents($file);if(db()->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'){$sql=preg_replace('/CREATE TABLE (?!IF NOT EXISTS)([^;]+);/s','CREATE TABLE $1 ENGINE=InnoDB;',$sql);}$statements=explode(';',$sql);foreach($statements as $statement)if(trim($statement)!=='')db()->exec($statement);query('INSERT INTO schema_migrations (version,applied_at) VALUES (?,?)',[$version,now()]);echo 'Applied '.$version.PHP_EOL;}

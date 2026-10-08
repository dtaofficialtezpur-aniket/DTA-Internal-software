<?php
/**
 * One-time setup check. Open this in the browser (HTTPS) after uploading the files and creating
 * config.php. It checks everything, creates the database tables, and tries to delete itself.
 */
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$ok = true;
function line(bool $pass, string $msg): void { global $ok; if (!$pass) $ok = false; echo ($pass ? '[ OK ] ' : '[FAIL] ') . $msg . "\n"; }

echo "DTA Sales setup check\n=====================\n";
line(PHP_VERSION_ID >= 80000, 'PHP 8.0 or newer (this server: ' . PHP_VERSION . ')');
line(extension_loaded('pdo_mysql'), 'pdo_mysql extension');
line(extension_loaded('mbstring'), 'mbstring extension');
line(function_exists('random_bytes') && function_exists('password_hash'), 'crypto functions');

$cfgPath = __DIR__ . '/config.php';
line(file_exists($cfgPath), 'config.php exists (copy config.example.php to config.php and fill it in)');
if (!file_exists($cfgPath)) { echo "\nFix the FAIL lines above and reload this page.\n"; exit; }

$cfg = require $cfgPath;
$key = (string)($cfg['admin_key'] ?? '');
line(strlen($key) >= 16 && $key !== 'change-me-to-a-long-random-string', 'admin_key is set and at least 16 characters');
line(!str_contains((string)($cfg['db_pass'] ?? ''), 'change-me'), 'database password has been changed from the example');

require __DIR__ . '/db.php';
try {
    $pdo = get_pdo(); // connects and creates any missing tables
    line(true, 'connected to the database');
    foreach (['users', 'sessions', 'leads', 'activities', 'demo_requests'] as $t) {
        $exists = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($t))->fetchColumn();
        line((bool)$exists, "table '$t' is ready");
    }
} catch (Throwable $e) {
    line(false, 'database connection failed: ' . $e->getMessage() . ' (check db_host / db_name / db_user / db_pass in config.php)');
}

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
line($https, 'page was opened over HTTPS (passwords must never travel over plain http)');

echo "\n";
if (!$ok) { echo "Some checks failed. Fix them and reload this page.\n"; exit; }

echo "Everything is ready.\n\nNext: open the DTA Sales app and choose 'Create admin account' (you need your admin_key).\n\n";
if (@unlink(__FILE__)) echo "This setup file has deleted itself.\n";
else echo "Please delete setup.php from the server now (File Manager).\n";

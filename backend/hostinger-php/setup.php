<?php
/**
 * Visit this once after uploading, over HTTPS, to create the tables and
 * get your admin key. Delete this file afterward (or at least don't leave
 * it linked anywhere) — anyone who loads it can read the admin key.
 */
require __DIR__ . '/db.php';

header('Content-Type: text/plain; charset=utf-8');

$pdo = get_pdo(); // creates tables + a fresh admin key on first run
$adminKey = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'adminKey'")->fetchColumn();

echo "Setup complete.\n\n";
echo "Admin key: {$adminKey}\n\n";
echo "Copy this now -- paste it into the dashboard's Settings -> Admin key.\n";
echo "You can also find it later by running this same page again, or by\n";
echo "looking at the 'settings' table (row 'adminKey') in phpMyAdmin.\n\n";
echo "Once you've copied it, delete this file from the server.\n";

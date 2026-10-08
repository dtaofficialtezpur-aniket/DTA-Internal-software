<?php
/** Visit once after uploading to create the tables, then delete this file. */
require __DIR__ . '/db.php';
header('Content-Type: text/plain; charset=utf-8');
get_pdo();
echo "Tables are ready. Delete this file now, then open the app and create the admin account\n";
echo "using the admin_key from config.php.\n";

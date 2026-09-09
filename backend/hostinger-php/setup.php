<?php
/**
 * Visit this once after uploading, over HTTPS, to create the database
 * tables. There's no admin key to copy anymore — instead, open the app
 * itself and register: the very first account created becomes the admin
 * automatically. Delete this file afterward (it's not sensitive, but no
 * reason to leave it reachable).
 */
require __DIR__ . '/db.php';

header('Content-Type: text/plain; charset=utf-8');

get_pdo(); // creates all tables if they don't exist yet

echo "Setup complete. Tables are ready.\n\n";
echo "Next: open the dashboard/desktop app, go to Settings, and connect it\n";
echo "to this Backend URL (this file's URL with 'api.php' instead of\n";
echo "'setup.php'). Then register an account -- the first one becomes the\n";
echo "admin automatically.\n\n";
echo "You can delete this file now; running it again is harmless (it only\n";
echo "creates tables that don't already exist), but there's no reason to\n";
echo "leave it up.\n";

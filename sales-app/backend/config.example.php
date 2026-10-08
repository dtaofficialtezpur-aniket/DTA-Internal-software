<?php
/**
 * Copy this file to config.php on the server and fill in the real values.
 * Never commit config.php (it's in .gitignore) -- it holds credentials.
 *
 * admin_key is the "main portal key": whoever knows it can create the
 * admin account (once). Pick a long random string and keep it to yourself.
 */
return [
    'db_host'   => 'localhost',
    'db_name'   => 'uXXXXXXXX_sales',
    'db_user'   => 'uXXXXXXXX_sales',
    'db_pass'   => 'change-me',
    // Optional: get an email for every new demo request (uses the server's mail()). Leave '' to turn off.
    'notify_email' => '',
    'admin_key' => 'change-me-to-a-long-random-string',
];

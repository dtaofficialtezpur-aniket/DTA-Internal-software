<?php
/**
 * Copy this file to config.php on the server and fill in the real values
 * from hPanel → Databases → MySQL Databases. Never commit config.php
 * (it's already in .gitignore) — it holds real credentials.
 */
return [
    'db_host' => 'localhost',
    'db_name' => 'uXXXXXXXX_subctl',
    'db_user' => 'uXXXXXXXX_subctl',
    'db_pass' => 'change-me',

    // Optional: only needed for the "Upload a document to autofill" button
    // on the Add Client forms. Get a key at https://console.anthropic.com/
    // — leave as null to leave that feature disabled (the button won't
    // work, but nothing else is affected).
    'anthropic_api_key' => null,
];

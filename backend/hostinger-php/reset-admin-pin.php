<?php
/**
 * Recovery tool for one specific case: the admin forgot their PIN, and
 * there's no one above them to approve a reset (that's what makes them
 * the admin). Since you're the only one who can upload files to this
 * server, having file access here IS the proof of identity — same trust
 * boundary as setup.php.
 *
 * Visit this once, over HTTPS, to clear the admin account's PIN. Next
 * login attempt with the admin's username will prompt to set a new PIN.
 * Delete this file afterward — anyone who can load it can do the same.
 */
require __DIR__ . '/db.php';

header('Content-Type: text/plain; charset=utf-8');

$pdo = get_pdo();
$admin = $pdo->query("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1")->fetch();

if (!$admin) {
    echo "No admin account exists yet. Nothing to reset — just register in the app.\n";
    exit;
}

$pdo->prepare('UPDATE users SET pin_hash = NULL, pin_reset_requested = 0 WHERE id = ?')->execute([$admin['id']]);
$pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$admin['id']]);

echo "Done. The admin account ('{$admin['username']}') has no PIN set now.\n\n";
echo "Open the app, log in with username '{$admin['username']}' -- it will\n";
echo "prompt you to set a brand new 6-digit PIN, no old PIN needed.\n\n";
echo "Now delete this file from the server.\n";

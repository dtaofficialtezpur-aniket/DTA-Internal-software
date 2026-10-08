<?php
/**
 * Emergency: the admin forgot their password. Upload this file, open it in the browser, enter the admin_key
 * from config.php and a new password. DELETE THIS FILE from the server afterwards.
 * (Employees do not need this -- the admin sets a new password for them from the Sales team page.)
 */
require __DIR__ . '/db.php';
header('Cache-Control: no-store');
header('Content-Type: text/html; charset=utf-8');

$msg = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $cfg = get_config();
    $key = (string)($cfg['admin_key'] ?? '');
    $pw = (string)($_POST['password'] ?? '');
    if ($key === '' || !hash_equals($key, (string)($_POST['admin_key'] ?? ''))) { sleep(2); $msg = 'Wrong admin key.'; }
    elseif (strlen($pw) < 8 || strlen($pw) > 64) { $msg = 'Password must be 8 to 64 characters.'; }
    else {
        $pdo = get_pdo();
        $st = $pdo->prepare("UPDATE users SET password_hash = ?, status = 'active', failed_attempts = 0, locked_until = NULL WHERE role = 'admin'");
        $st->execute([password_hash($pw, PASSWORD_DEFAULT)]);
        $pdo->exec("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')");
        $msg = $st->rowCount() ? 'Done. The admin password is changed. Now DELETE this file from the server.' : 'No admin account exists yet -- create it in the app instead.';
    }
}
?><!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset admin password</title>
<body style="font-family:sans-serif;max-width:360px;margin:40px auto;padding:0 16px">
<h2>Reset admin password</h2>
<?php if ($msg): ?><p><b><?= htmlspecialchars($msg) ?></b></p><?php endif; ?>
<form method="post" style="display:grid;gap:10px">
  <label>Admin key <input type="password" name="admin_key" required autocomplete="off"></label>
  <label>New password (8+ characters) <input type="password" name="password" required minlength="8" maxlength="64" autocomplete="new-password"></label>
  <button>Reset password</button>
</form>
</body>

<?php
/**
 * Emergency: the admin forgot their PIN. Upload this file, open it in the browser, enter the admin_key
 * from config.php and a new 6-digit PIN. DELETE THIS FILE from the server afterwards.
 * (Employees do not need this -- the admin resets their PIN from the Sales team page.)
 */
require __DIR__ . '/db.php';
header('Cache-Control: no-store');
header('Content-Type: text/html; charset=utf-8');

$msg = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $cfg = get_config();
    $key = (string)($cfg['admin_key'] ?? '');
    $pin = (string)($_POST['pin'] ?? '');
    if ($key === '' || !hash_equals($key, (string)($_POST['admin_key'] ?? ''))) { sleep(2); $msg = 'Wrong admin key.'; }
    elseif (!preg_match('/^\d{6}$/', $pin)) { $msg = 'PIN must be exactly 6 digits.'; }
    else {
        $pdo = get_pdo();
        $st = $pdo->prepare("UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE role = 'admin'");
        $st->execute([password_hash($pin, PASSWORD_DEFAULT)]);
        $pdo->exec("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')");
        $msg = $st->rowCount() ? 'Done. The admin PIN is changed. Now DELETE this file from the server.' : 'No admin account exists yet -- create it in the app instead.';
    }
}
?><!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset admin PIN</title>
<body style="font-family:sans-serif;max-width:360px;margin:40px auto;padding:0 16px">
<h2>Reset admin PIN</h2>
<?php if ($msg): ?><p><b><?= htmlspecialchars($msg) ?></b></p><?php endif; ?>
<form method="post" style="display:grid;gap:10px">
  <label>Admin key <input type="password" name="admin_key" required autocomplete="off"></label>
  <label>New 6-digit PIN <input type="password" name="pin" required maxlength="6" inputmode="numeric" pattern="\d{6}" autocomplete="off"></label>
  <button>Reset PIN</button>
</form>
</body>

<?php
/**
 * DTA Subscription Control — PHP/MySQL backend for Hostinger shared hosting.
 *
 * Two kinds of endpoints:
 *  - action=status (GET): the client-software check-in. Public, gated only
 *    by that one client's own client_id + api_key.
 *  - everything else (POST): the dashboard. Gated by a session token from
 *    login, except register/login/requestPinReset/setPin themselves.
 *
 * Accounts: the first person ever to complete registration becomes the
 * admin automatically; everyone after that registers as an 'employee' and
 * sits 'pending' until the admin approves them from the Team screen. Admin
 * can remove an employee at any time, which deletes their sessions too —
 * they lose access immediately, not just at their token's natural expiry.
 */

require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_out(array $data): void
{
    echo json_encode($data);
    exit;
}

/* ---------------- settings helpers ---------------- */

function get_setting(PDO $pdo, string $key): ?string
{
    $stmt = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();
    return $value === false ? null : $value;
}

function get_all_settings(PDO $pdo): array
{
    $rows = $pdo->query('SELECT setting_key, setting_value FROM settings')->fetchAll();
    $out = [];
    foreach ($rows as $row) {
        $out[$row['setting_key']] = $row['setting_value'];
    }
    return [
        'agencyName' => $out['agencyName'] ?? 'DTA',
        'leadDays' => (int) ($out['leadDays'] ?? 7),
        'defaultGrace' => (int) ($out['defaultGrace'] ?? 5),
    ];
}

function set_setting(PDO $pdo, string $key, string $value): void
{
    $stmt = $pdo->prepare('
        INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    ');
    $stmt->execute([$key, $value]);
}

/* ---------------- auth helpers ---------------- */

function gen_token(): string
{
    return bin2hex(random_bytes(32));
}

function is_valid_pin(?string $pin): bool
{
    return is_string($pin) && preg_match('/^\d{6}$/', $pin) === 1;
}

function find_user_by_username(PDO $pdo, string $username): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function find_user_by_id(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function user_public(array $u): array
{
    return [
        'id' => (int) $u['id'],
        'username' => $u['username'],
        'fullName' => $u['full_name'],
        'role' => $u['role'],
        'status' => $u['status'],
        'pinResetRequested' => (bool) $u['pin_reset_requested'],
        'createdAt' => $u['created_at'],
    ];
}

/**
 * Resolves a session token to its user, or fails the request. Also fails
 * (not just "not found") if the account was removed/rejected since the
 * token was issued — a removed employee loses access immediately.
 */
function require_session(PDO $pdo, ?string $token): array
{
    if (!$token) {
        json_out(['error' => 'Not logged in.']);
    }
    $stmt = $pdo->prepare('
        SELECT u.* FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > NOW()
    ');
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user) {
        json_out(['error' => 'Session expired or invalid. Please log in again.']);
    }
    if ($user['status'] !== 'active') {
        json_out(['error' => 'Your access has been removed. Contact your admin.']);
    }
    return $user;
}

function require_admin_session(PDO $pdo, ?string $token): array
{
    $user = require_session($pdo, $token);
    if ($user['role'] !== 'admin') {
        json_out(['error' => 'Admin access required.']);
    }
    return $user;
}

/* ---------------- client helpers (unchanged shape) ---------------- */

function gen_client_id(PDO $pdo): string
{
    do {
        $id = 'DTA-CL-' . random_int(1000, 9999);
        $stmt = $pdo->prepare('SELECT 1 FROM clients WHERE id = ?');
        $stmt->execute([$id]);
    } while ($stmt->fetchColumn());
    return $id;
}

function gen_api_key(): string
{
    return 'sk_live_' . bin2hex(random_bytes(10));
}

function fmt_date(string $mysqlDateTime): string
{
    return substr($mysqlDateTime, 0, 10);
}

function log_event(PDO $pdo, string $clientId, string $action, string $note): void
{
    $stmt = $pdo->prepare('INSERT INTO history (client_id, ts, action, note) VALUES (?, NOW(), ?, ?)');
    $stmt->execute([$clientId, $action, $note]);
}

function find_client(PDO $pdo, string $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM clients WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function client_to_json(array $c): array
{
    return [
        'id' => $c['id'],
        'apiKey' => $c['api_key'],
        'client' => $c['client_name'],
        'software' => $c['software'],
        'cycle' => $c['cycle'],
        'amount' => (float) $c['amount'],
        'start' => $c['start_date'],
        'nextDue' => $c['next_due'],
        'grace' => (int) $c['grace_days'],
        'status' => $c['status'],
        'pausedAt' => $c['paused_at'],
    ];
}

/* ---------------- request handling ---------------- */

$pdo = get_pdo();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? null;
    if ($action !== 'status') {
        json_out(['error' => 'Unknown or missing action for GET. Use POST for everything else.']);
    }
    handle_status($pdo, $_GET);
} elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $body['action'] ?? null;

    switch ($action) {
        case 'status':
            handle_status($pdo, $body);
            break;
        case 'register':
            handle_register($pdo, $body);
            break;
        case 'login':
            handle_login($pdo, $body);
            break;
        case 'requestPinReset':
            handle_request_pin_reset($pdo, $body);
            break;
        case 'setPin':
            handle_set_pin($pdo, $body);
            break;
        case 'me':
            json_out(['ok' => true, 'user' => user_public(require_session($pdo, $body['token'] ?? null))]);
            break;
        case 'logout':
            handle_logout($pdo, $body);
            break;

        // Everything below needs a logged-in user.
        case 'list':
            require_session($pdo, $body['token'] ?? null);
            handle_list($pdo);
            break;
        case 'add':
            require_session($pdo, $body['token'] ?? null);
            handle_add($pdo, $body);
            break;
        case 'pause':
            require_session($pdo, $body['token'] ?? null);
            handle_pause($pdo, $body);
            break;
        case 'resume':
            require_session($pdo, $body['token'] ?? null);
            handle_resume($pdo, $body);
            break;
        case 'markPaid':
            require_session($pdo, $body['token'] ?? null);
            handle_mark_paid($pdo, $body);
            break;
        case 'regenerateKey':
            require_session($pdo, $body['token'] ?? null);
            handle_regenerate_key($pdo, $body);
            break;
        case 'updateSettings':
            require_session($pdo, $body['token'] ?? null);
            handle_update_settings($pdo, $body);
            break;
        case 'getSettings':
            require_session($pdo, $body['token'] ?? null);
            json_out(get_all_settings($pdo));
            break;

        // Admin-only team management.
        case 'listTeam':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_list_team($pdo);
            break;
        case 'approveRegistration':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_decide_registration($pdo, $body, 'active');
            break;
        case 'rejectRegistration':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_decide_registration($pdo, $body, 'rejected');
            break;
        case 'removeEmployee':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_remove_employee($pdo, $body);
            break;
        case 'approvePinReset':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_approve_pin_reset($pdo, $body);
            break;

        default:
            json_out(['error' => 'Unknown action: ' . $action]);
    }
} else {
    json_out(['error' => 'Unsupported method.']);
}

/* ---------------- client status check (public) ---------------- */

function handle_status(PDO $pdo, array $params): void
{
    $clientId = $params['client_id'] ?? null;
    $apiKey = $params['api_key'] ?? null;
    if (!$clientId || !$apiKey) {
        json_out(['status' => 'unknown', 'message' => 'Missing client_id or api_key.']);
    }

    $c = find_client($pdo, $clientId);
    if (!$c || !hash_equals($c['api_key'], $apiKey)) {
        json_out(['status' => 'unknown', 'message' => 'Client not found or API key mismatch.']);
    }

    if ($c['status'] === 'paused') {
        json_out([
            'status' => 'paused',
            'client_id' => $c['id'],
            'paused_at' => $c['paused_at'],
            'message' => 'Subscription payment overdue. Contact DTA to resume access.',
        ]);
    }

    json_out([
        'status' => 'active',
        'client_id' => $c['id'],
        'next_due_date' => fmt_date($c['next_due']),
        'grace_period_days' => (int) $c['grace_days'],
        'message' => null,
    ]);
}

/* ---------------- auth actions ---------------- */

function handle_register(PDO $pdo, array $body): void
{
    $username = trim((string) ($body['username'] ?? ''));
    $fullName = trim((string) ($body['fullName'] ?? ''));
    $pin = (string) ($body['pin'] ?? '');

    if ($username === '' || strlen($username) > 64 || !preg_match('/^[a-zA-Z0-9_.-]+$/', $username)) {
        json_out(['error' => 'Username must be letters/numbers/._- only.']);
    }
    if ($fullName === '') {
        json_out(['error' => 'Full name is required.']);
    }
    if (!is_valid_pin($pin)) {
        json_out(['error' => 'PIN must be exactly 6 digits.']);
    }
    if (find_user_by_username($pdo, $username)) {
        json_out(['error' => 'That username is already taken.']);
    }

    $isFirstUser = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0;
    $role = $isFirstUser ? 'admin' : 'employee';
    $status = $isFirstUser ? 'active' : 'pending';
    $pinHash = password_hash($pin, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare('
        INSERT INTO users (username, full_name, role, status, pin_hash, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    ');
    $stmt->execute([$username, $fullName, $role, $status, $pinHash]);

    if ($status === 'active') {
        $user = find_user_by_username($pdo, $username);
        $token = create_session($pdo, (int) $user['id']);
        json_out(['ok' => true, 'status' => 'active', 'token' => $token, 'user' => user_public($user)]);
    } else {
        json_out(['ok' => true, 'status' => 'pending', 'message' => 'Registered. Waiting for admin approval before you can log in.']);
    }
}

function create_session(PDO $pdo, int $userId): string
{
    $token = gen_token();
    $stmt = $pdo->prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 12 HOUR))');
    $stmt->execute([$token, $userId]);
    return $token;
}

function handle_login(PDO $pdo, array $body): void
{
    $username = trim((string) ($body['username'] ?? ''));
    $pin = (string) ($body['pin'] ?? '');

    $user = find_user_by_username($pdo, $username);
    if (!$user) {
        json_out(['error' => 'No account with that username.']);
    }
    if ($user['status'] === 'pending') {
        json_out(['error' => 'Your registration is awaiting admin approval.']);
    }
    if ($user['status'] !== 'active') {
        json_out(['error' => 'Your access has been removed. Contact your admin.']);
    }
    if ($user['pin_hash'] === null) {
        // Admin approved a PIN reset (or, in an edge case, none was ever
        // set) — this account is waiting for its holder to claim it with
        // a fresh PIN, no old PIN to check.
        json_out(['ok' => true, 'needsPinSetup' => true, 'username' => $user['username']]);
    }
    if (!is_valid_pin($pin) || !password_verify($pin, $user['pin_hash'])) {
        json_out(['error' => 'Incorrect PIN.']);
    }

    $token = create_session($pdo, (int) $user['id']);
    json_out(['ok' => true, 'token' => $token, 'user' => user_public($user)]);
}

function handle_set_pin(PDO $pdo, array $body): void
{
    $username = trim((string) ($body['username'] ?? ''));
    $newPin = (string) ($body['newPin'] ?? '');

    $user = find_user_by_username($pdo, $username);
    if (!$user) {
        json_out(['error' => 'No account with that username.']);
    }
    if ($user['status'] !== 'active') {
        json_out(['error' => 'This account cannot set a PIN right now.']);
    }
    if ($user['pin_hash'] !== null) {
        // A PIN is already set — this endpoint only claims an
        // admin-cleared (reset-approved) or brand-new account. Changing
        // an existing PIN isn't wired up as a separate feature yet.
        json_out(['error' => 'This account already has a PIN set.']);
    }
    if (!is_valid_pin($newPin)) {
        json_out(['error' => 'PIN must be exactly 6 digits.']);
    }

    $stmt = $pdo->prepare('UPDATE users SET pin_hash = ?, pin_reset_requested = 0 WHERE id = ?');
    $stmt->execute([password_hash($newPin, PASSWORD_DEFAULT), $user['id']]);

    $token = create_session($pdo, (int) $user['id']);
    $user = find_user_by_id($pdo, (int) $user['id']);
    json_out(['ok' => true, 'token' => $token, 'user' => user_public($user)]);
}

function handle_request_pin_reset(PDO $pdo, array $body): void
{
    $username = trim((string) ($body['username'] ?? ''));
    $user = find_user_by_username($pdo, $username);
    if (!$user || $user['status'] !== 'active') {
        // Same message either way — don't reveal whether a username exists.
        json_out(['ok' => true, 'message' => 'If that account exists, your admin has been notified.']);
    }
    $stmt = $pdo->prepare('UPDATE users SET pin_reset_requested = 1 WHERE id = ?');
    $stmt->execute([$user['id']]);
    json_out(['ok' => true, 'message' => 'Reset requested. Ask your admin to approve it, then log in again to set a new PIN.']);
}

function handle_logout(PDO $pdo, array $body): void
{
    $token = $body['token'] ?? null;
    if ($token) {
        $stmt = $pdo->prepare('DELETE FROM sessions WHERE token = ?');
        $stmt->execute([$token]);
    }
    json_out(['ok' => true]);
}

/* ---------------- admin: team management ---------------- */

function handle_list_team(PDO $pdo): void
{
    $rows = $pdo->query('SELECT * FROM users ORDER BY created_at ASC')->fetchAll();
    json_out(['ok' => true, 'users' => array_map('user_public', $rows)]);
}

function handle_decide_registration(PDO $pdo, array $body, string $newStatus): void
{
    $id = (int) ($body['userId'] ?? 0);
    $user = find_user_by_id($pdo, $id);
    if (!$user || $user['status'] !== 'pending') {
        json_out(['error' => 'No pending registration with that id.']);
    }
    $stmt = $pdo->prepare('UPDATE users SET status = ?, decided_at = NOW() WHERE id = ?');
    $stmt->execute([$newStatus, $id]);
    json_out(['ok' => true]);
}

function handle_remove_employee(PDO $pdo, array $body): void
{
    $id = (int) ($body['userId'] ?? 0);
    $user = find_user_by_id($pdo, $id);
    if (!$user) {
        json_out(['error' => 'No such user.']);
    }
    if ($user['role'] === 'admin') {
        json_out(['error' => 'Cannot remove the admin account.']);
    }
    $pdo->prepare("UPDATE users SET status = 'removed', decided_at = NOW() WHERE id = ?")->execute([$id]);
    $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]); // instant logout, not just at token expiry
    json_out(['ok' => true]);
}

function handle_approve_pin_reset(PDO $pdo, array $body): void
{
    $id = (int) ($body['userId'] ?? 0);
    $user = find_user_by_id($pdo, $id);
    if (!$user || !$user['pin_reset_requested']) {
        json_out(['error' => 'No pending reset request for that user.']);
    }
    $pdo->prepare('UPDATE users SET pin_hash = NULL, pin_reset_requested = 0 WHERE id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]); // force re-login with the new PIN
    json_out(['ok' => true]);
}

/* ---------------- client management (any logged-in user) ---------------- */

function handle_list(PDO $pdo): void
{
    $clients = $pdo->query('SELECT * FROM clients ORDER BY start_date DESC')->fetchAll();
    $historyStmt = $pdo->prepare('SELECT client_id, ts, action, note FROM history WHERE client_id = ? ORDER BY ts DESC');

    $out = [];
    foreach ($clients as $c) {
        $json = client_to_json($c);
        $historyStmt->execute([$c['id']]);
        $json['history'] = array_map(function ($h) {
            return ['clientId' => $h['client_id'], 'timestamp' => $h['ts'], 'action' => $h['action'], 'note' => $h['note']];
        }, $historyStmt->fetchAll());
        $out[] = $json;
    }

    json_out(['settings' => get_all_settings($pdo), 'clients' => $out]);
}

function handle_add(PDO $pdo, array $body): void
{
    $id = gen_client_id($pdo);
    $apiKey = gen_api_key();
    $settings = get_all_settings($pdo);

    $cycle = ($body['cycle'] ?? '') === 'Annual' ? 'Annual' : 'Monthly';
    $start = !empty($body['start']) ? $body['start'] : date('Y-m-d');
    $grace = isset($body['grace']) ? (int) $body['grace'] : $settings['defaultGrace'];
    $days = $cycle === 'Annual' ? 365 : 30;
    $nextDue = date('Y-m-d', strtotime("{$start} +{$days} days"));

    $stmt = $pdo->prepare('
        INSERT INTO clients (id, api_key, client_name, software, cycle, amount, start_date, next_due, grace_days, status, paused_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ');
    $stmt->execute([
        $id, $apiKey,
        substr((string) ($body['client'] ?? ''), 0, 255),
        substr((string) ($body['software'] ?? ''), 0, 255),
        $cycle,
        (float) ($body['amount'] ?? 0),
        $start, $nextDue, $grace, 'active',
    ]);

    log_event($pdo, $id, 'onboarded', 'Client onboarded, license issued');

    $c = find_client($pdo, $id);
    json_out(['ok' => true, 'client' => client_to_json($c)]);
}

function handle_pause(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $stmt = $pdo->prepare("UPDATE clients SET status = 'paused', paused_at = NOW() WHERE id = ?");
    $stmt->execute([$id]);
    log_event($pdo, $id, 'paused', 'Paused by DTA Admin — access locked');
    json_out(['ok' => true]);
}

function handle_resume(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $stmt = $pdo->prepare("UPDATE clients SET status = 'active', paused_at = NULL WHERE id = ?");
    $stmt->execute([$id]);
    log_event($pdo, $id, 'resumed', 'Resumed by DTA Admin — access restored');
    json_out(['ok' => true]);
}

function handle_mark_paid(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $cycleDays = $c['cycle'] === 'Annual' ? 365 : 30;
    $base = max(strtotime('today'), strtotime($c['next_due']));
    $nextDue = date('Y-m-d', strtotime("+{$cycleDays} days", $base));

    $stmt = $pdo->prepare('UPDATE clients SET next_due = ? WHERE id = ?');
    $stmt->execute([$nextDue, $id]);
    log_event($pdo, $id, 'paid', "Marked as paid by DTA Admin — renewed to {$nextDue}");
    json_out(['ok' => true, 'nextDue' => $nextDue]);
}

function handle_regenerate_key(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $newKey = gen_api_key();
    $stmt = $pdo->prepare('UPDATE clients SET api_key = ? WHERE id = ?');
    $stmt->execute([$newKey, $id]);
    log_event($pdo, $id, 'keyRegenerated', 'API key regenerated by DTA Admin');
    json_out(['ok' => true, 'apiKey' => $newKey]);
}

function handle_update_settings(PDO $pdo, array $body): void
{
    if (isset($body['name'])) set_setting($pdo, 'agencyName', (string) $body['name']);
    if (isset($body['lead'])) set_setting($pdo, 'leadDays', (string) (int) $body['lead']);
    if (isset($body['grace'])) set_setting($pdo, 'defaultGrace', (string) (int) $body['grace']);
    json_out(['ok' => true, 'settings' => get_all_settings($pdo)]);
}

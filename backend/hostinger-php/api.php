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
 * Accounts: 'register' only ever creates ONE account — the first person to
 * call it becomes the admin. After that it's closed; employees don't
 * self-register. Instead the admin creates their account (username + full
 * name, no PIN yet) from the Team screen, and the employee sets their own
 * PIN the first time they log in with that username. Admin can remove an
 * employee at any time, which deletes their sessions too — they lose
 * access immediately, not just at their token's natural expiry.
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
 * (not just "not found") if the account was removed since the token was
 * issued — a removed employee loses access immediately.
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

/* ---------------- normal client helpers (basic-details clients) ---------------- */

function gen_normal_client_id(PDO $pdo): string
{
    do {
        $id = 'DTA-NC-' . random_int(1000, 9999);
        $stmt = $pdo->prepare('SELECT 1 FROM normal_clients WHERE id = ?');
        $stmt->execute([$id]);
    } while ($stmt->fetchColumn());
    return $id;
}

function find_normal_client(PDO $pdo, string $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM normal_clients WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function normal_client_to_json(array $c): array
{
    return [
        'id' => $c['id'],
        'client' => $c['client_name'],
        'address' => $c['address'],
        'contact' => $c['contact'],
        'totalAmount' => (float) $c['total_amount'],
        'advancePayment' => (float) $c['advance_payment'],
        'remainingPayment' => (float) $c['remaining_payment'],
        'notes' => $c['notes'],
        'createdAt' => $c['created_at'],
    ];
}

/* ---------------- invoices ---------------- */

function invoice_to_json(array $i): array
{
    return [
        'id' => (int) $i['id'],
        'number' => sprintf('DTA-D%03d', $i['id']),
        'clientType' => $i['client_type'],
        'clientId' => $i['client_id'],
        'client' => $i['client_name'],
        'description' => $i['description'],
        'amount' => (float) $i['amount'],
        'issuedAt' => $i['issued_date'],
    ];
}

function handle_create_invoice(PDO $pdo, array $body, array $user): void
{
    $clientType = ($body['clientType'] ?? '') === 'normal' ? 'normal' : 'subscription';
    $clientId = (string) ($body['clientId'] ?? '');

    if ($clientType === 'normal') {
        $c = find_normal_client($pdo, $clientId);
        if (!$c) json_out(['error' => 'Client not found: ' . $clientId]);
        $clientName = $c['client_name'];
        $defaultAmount = (float) $c['remaining_payment'];
    } else {
        $c = find_client($pdo, $clientId);
        if (!$c) json_out(['error' => 'Client not found: ' . $clientId]);
        $clientName = $c['client_name'];
        $defaultAmount = (float) $c['amount'];
    }

    $amount = isset($body['amount']) ? (float) $body['amount'] : $defaultAmount;
    if ($amount <= 0) {
        json_out(['error' => 'Invoice amount must be greater than zero.']);
    }
    $description = substr((string) ($body['description'] ?? ''), 0, 255);

    $stmt = $pdo->prepare('
        INSERT INTO invoices (client_type, client_id, client_name, description, amount, issued_date, created_by)
        VALUES (?, ?, ?, ?, ?, NOW(), ?)
    ');
    $stmt->execute([$clientType, $clientId, $clientName, $description, $amount, (int) $user['id']]);
    $id = (int) $pdo->lastInsertId();

    log_event($pdo, $clientId, 'invoiced', 'Invoice ' . sprintf('DTA-D%03d', $id) . ' generated for ' . number_format($amount, 2));

    $stmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
    $stmt->execute([$id]);
    json_out(['ok' => true, 'invoice' => invoice_to_json($stmt->fetch())]);
}

function handle_list_invoices(PDO $pdo, array $body): void
{
    $clientType = ($body['clientType'] ?? '') === 'normal' ? 'normal' : 'subscription';
    $clientId = (string) ($body['clientId'] ?? '');
    $stmt = $pdo->prepare('SELECT * FROM invoices WHERE client_type = ? AND client_id = ? ORDER BY issued_date DESC, id DESC');
    $stmt->execute([$clientType, $clientId]);
    json_out(['ok' => true, 'invoices' => array_map('invoice_to_json', $stmt->fetchAll())]);
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
} elseif ($method === 'POST' && str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data')) {
    // File uploads only — everything else is JSON below. Multipart is
    // needed here because the file bytes shouldn't be base64-inflated
    // into a JSON body.
    $action = $_POST['action'] ?? null;
    if ($action === 'uploadFile') {
        $user = require_admin_session($pdo, $_POST['token'] ?? null);
        handle_upload_file($pdo, $_POST, $_FILES['file'] ?? null, $user);
    } elseif ($action === 'extractClientDocument') {
        require_session($pdo, $_POST['token'] ?? null);
        handle_extract_client_document($pdo, $_POST, $_FILES['file'] ?? null);
    } else {
        json_out(['error' => 'Unknown action: ' . $action]);
    }
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
        case 'setupStatus':
            handle_setup_status($pdo);
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
        case 'deleteClient':
            require_session($pdo, $body['token'] ?? null);
            handle_delete_client($pdo, $body);
            break;
        case 'addNormalClient':
            require_session($pdo, $body['token'] ?? null);
            handle_add_normal_client($pdo, $body);
            break;
        case 'updateNormalClient':
            require_session($pdo, $body['token'] ?? null);
            handle_update_normal_client($pdo, $body);
            break;
        case 'recordNormalClientPayment':
            require_session($pdo, $body['token'] ?? null);
            handle_record_normal_client_payment($pdo, $body);
            break;
        case 'deleteNormalClient':
            require_session($pdo, $body['token'] ?? null);
            handle_delete_normal_client($pdo, $body);
            break;
        case 'updateSettings':
            require_session($pdo, $body['token'] ?? null);
            handle_update_settings($pdo, $body);
            break;
        case 'getSettings':
            require_session($pdo, $body['token'] ?? null);
            json_out(get_all_settings($pdo));
            break;
        case 'createInvoice':
            handle_create_invoice($pdo, $body, require_session($pdo, $body['token'] ?? null));
            break;
        case 'listInvoices':
            require_session($pdo, $body['token'] ?? null);
            handle_list_invoices($pdo, $body);
            break;

        // Admin-only team management.
        case 'listTeam':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_list_team($pdo);
            break;
        case 'createEmployee':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_create_employee($pdo, $body);
            break;
        case 'removeEmployee':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_remove_employee($pdo, $body);
            break;
        case 'approvePinReset':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_approve_pin_reset($pdo, $body);
            break;

        // File library. listFiles/downloadFile: any logged-in user, but
        // filtered to what they're allowed to see. Everything else that
        // manages folders/files/permissions is admin-only.
        case 'listFolders':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_list_folders($pdo);
            break;
        case 'createFolder':
            handle_create_folder($pdo, $body, require_admin_session($pdo, $body['token'] ?? null));
            break;
        case 'deleteFolder':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_delete_folder($pdo, $body);
            break;
        case 'listFiles':
            handle_list_files($pdo, require_session($pdo, $body['token'] ?? null));
            break;
        case 'setFileAccess':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_set_file_access($pdo, $body);
            break;
        case 'deleteFile':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_delete_file($pdo, $body);
            break;
        case 'downloadFile':
            handle_download_file($pdo, $body, require_session($pdo, $body['token'] ?? null));
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

function handle_setup_status(PDO $pdo): void
{
    $hasAdmin = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0;
    json_out(['ok' => true, 'registrationOpen' => !$hasAdmin]);
}

function handle_register(PDO $pdo, array $body): void
{
    $isFirstUser = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0;
    if (!$isFirstUser) {
        json_out(['error' => 'Registration is closed. Ask your admin to create your account.']);
    }

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

    $pinHash = password_hash($pin, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('
        INSERT INTO users (username, full_name, role, status, pin_hash, created_at)
        VALUES (?, ?, \'admin\', \'active\', ?, NOW())
    ');
    $stmt->execute([$username, $fullName, $pinHash]);

    $user = find_user_by_username($pdo, $username);
    $token = create_session($pdo, (int) $user['id']);
    json_out(['ok' => true, 'status' => 'active', 'token' => $token, 'user' => user_public($user)]);
}

function handle_create_employee(PDO $pdo, array $body): void
{
    $username = trim((string) ($body['username'] ?? ''));
    $fullName = trim((string) ($body['fullName'] ?? ''));

    if ($username === '' || strlen($username) > 64 || !preg_match('/^[a-zA-Z0-9_.-]+$/', $username)) {
        json_out(['error' => 'Username must be letters/numbers/._- only.']);
    }
    if ($fullName === '') {
        json_out(['error' => 'Full name is required.']);
    }
    if (find_user_by_username($pdo, $username)) {
        json_out(['error' => 'That username is already taken.']);
    }

    // No PIN yet — pin_hash stays NULL, same state as an approved reset.
    // The employee sets their own PIN the first time they log in.
    $stmt = $pdo->prepare("
        INSERT INTO users (username, full_name, role, status, pin_hash, created_at)
        VALUES (?, ?, 'employee', 'active', NULL, NOW())
    ");
    $stmt->execute([$username, $fullName]);

    $user = find_user_by_username($pdo, $username);
    json_out(['ok' => true, 'user' => user_public($user)]);
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

    $normalClients = $pdo->query('SELECT * FROM normal_clients ORDER BY created_at DESC')->fetchAll();
    $normalOut = [];
    foreach ($normalClients as $c) {
        $json = normal_client_to_json($c);
        $historyStmt->execute([$c['id']]);
        $json['history'] = array_map(function ($h) {
            return ['clientId' => $h['client_id'], 'timestamp' => $h['ts'], 'action' => $h['action'], 'note' => $h['note']];
        }, $historyStmt->fetchAll());
        $normalOut[] = $json;
    }

    json_out(['settings' => get_all_settings($pdo), 'clients' => $out, 'normalClients' => $normalOut]);
}

function handle_add(PDO $pdo, array $body): void
{
    $clientName = trim((string) ($body['client'] ?? ''));
    $softwareName = trim((string) ($body['software'] ?? ''));
    if ($clientName === '' || $softwareName === '') {
        json_out(['error' => 'Client name and software name are required.']);
    }
    $amount = (float) ($body['amount'] ?? 0);
    if ($amount <= 0) {
        json_out(['error' => 'Plan amount must be greater than zero.']);
    }

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
        substr($clientName, 0, 255),
        substr($softwareName, 0, 255),
        $cycle, $amount,
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

/* ---------------- normal clients (basic-details clients) ---------------- */

function handle_add_normal_client(PDO $pdo, array $body): void
{
    $clientName = trim((string) ($body['client'] ?? ''));
    if ($clientName === '') {
        json_out(['error' => 'Client name is required.']);
    }

    $totalAmount = max(0, (float) ($body['totalAmount'] ?? 0));
    $advancePayment = max(0, (float) ($body['advancePayment'] ?? 0));
    if ($advancePayment > $totalAmount) {
        json_out(['error' => 'Advance payment cannot be more than the total amount.']);
    }
    $remainingPayment = max(0, $totalAmount - $advancePayment);

    $id = gen_normal_client_id($pdo);
    $stmt = $pdo->prepare('
        INSERT INTO normal_clients (id, client_name, address, contact, total_amount, advance_payment, remaining_payment, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ');
    $stmt->execute([
        $id, substr($clientName, 0, 255),
        substr((string) ($body['address'] ?? ''), 0, 2000),
        substr((string) ($body['contact'] ?? ''), 0, 255),
        $totalAmount, $advancePayment, $remainingPayment,
        substr((string) ($body['notes'] ?? ''), 0, 2000),
    ]);

    log_event($pdo, $id, 'onboarded', 'Client added');

    $c = find_normal_client($pdo, $id);
    json_out(['ok' => true, 'client' => normal_client_to_json($c)]);
}

function handle_update_normal_client(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_normal_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $clientName = trim((string) ($body['client'] ?? ''));
    if ($clientName === '') {
        json_out(['error' => 'Client name is required.']);
    }

    $totalAmount = max(0, (float) ($body['totalAmount'] ?? 0));
    $advancePayment = max(0, (float) ($body['advancePayment'] ?? 0));
    if ($advancePayment > $totalAmount) {
        json_out(['error' => 'Advance payment cannot be more than the total amount.']);
    }
    $remainingPayment = max(0, $totalAmount - $advancePayment);

    $stmt = $pdo->prepare('
        UPDATE normal_clients
        SET client_name = ?, address = ?, contact = ?, total_amount = ?, advance_payment = ?, remaining_payment = ?, notes = ?
        WHERE id = ?
    ');
    $stmt->execute([
        substr($clientName, 0, 255),
        substr((string) ($body['address'] ?? ''), 0, 2000),
        substr((string) ($body['contact'] ?? ''), 0, 255),
        $totalAmount, $advancePayment, $remainingPayment,
        substr((string) ($body['notes'] ?? ''), 0, 2000),
        $id,
    ]);

    log_event($pdo, $id, 'updated', 'Client details updated');
    json_out(['ok' => true, 'client' => normal_client_to_json(find_normal_client($pdo, $id))]);
}

function handle_record_normal_client_payment(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_normal_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $amount = (float) ($body['amount'] ?? 0);
    if ($amount <= 0) {
        json_out(['error' => 'Payment amount must be greater than zero.']);
    }

    $advancePayment = max(0, (float) $c['advance_payment'] + $amount);
    $remainingPayment = max(0, (float) $c['total_amount'] - $advancePayment);

    $stmt = $pdo->prepare('UPDATE normal_clients SET advance_payment = ?, remaining_payment = ? WHERE id = ?');
    $stmt->execute([$advancePayment, $remainingPayment, $id]);

    log_event($pdo, $id, 'paid', 'Payment of ' . number_format($amount, 2) . ' recorded');
    json_out(['ok' => true, 'client' => normal_client_to_json(find_normal_client($pdo, $id))]);
}

function handle_delete_normal_client(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_normal_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $stmt = $pdo->prepare('DELETE FROM normal_clients WHERE id = ?');
    $stmt->execute([$id]);
    $del = $pdo->prepare('DELETE FROM history WHERE client_id = ?');
    $del->execute([$id]);

    json_out(['ok' => true]);
}

function handle_delete_client(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $stmt = $pdo->prepare('DELETE FROM clients WHERE id = ?');
    $stmt->execute([$id]);
    $del = $pdo->prepare('DELETE FROM history WHERE client_id = ?');
    $del->execute([$id]);

    json_out(['ok' => true]);
}

function handle_update_settings(PDO $pdo, array $body): void
{
    if (isset($body['name'])) set_setting($pdo, 'agencyName', (string) $body['name']);
    if (isset($body['lead'])) set_setting($pdo, 'leadDays', (string) (int) $body['lead']);
    if (isset($body['grace'])) set_setting($pdo, 'defaultGrace', (string) (int) $body['grace']);
    json_out(['ok' => true, 'settings' => get_all_settings($pdo)]);
}

/* ---------------- file library ---------------- */

function find_folder(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM folders WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function find_file(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM files WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function folder_path(PDO $pdo, ?int $folderId): string
{
    $parts = [];
    $guard = 0;
    while ($folderId !== null && $guard++ < 50) {
        $f = find_folder($pdo, $folderId);
        if (!$f) break;
        array_unshift($parts, $f['name']);
        $folderId = $f['parent_id'] !== null ? (int) $f['parent_id'] : null;
    }
    return $parts ? implode(' / ', $parts) : '';
}

function has_file_access(PDO $pdo, int $fileId, int $userId): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM file_access WHERE file_id = ? AND user_id = ?');
    $stmt->execute([$fileId, $userId]);
    return (bool) $stmt->fetchColumn();
}

function handle_list_folders(PDO $pdo): void
{
    $rows = $pdo->query('SELECT id, name, parent_id FROM folders ORDER BY name ASC')->fetchAll();
    $out = array_map(function ($f) {
        return ['id' => (int) $f['id'], 'name' => $f['name'], 'parentId' => $f['parent_id'] !== null ? (int) $f['parent_id'] : null];
    }, $rows);
    json_out(['ok' => true, 'folders' => $out]);
}

function handle_create_folder(PDO $pdo, array $body, array $user): void
{
    $name = trim((string) ($body['name'] ?? ''));
    $parentId = isset($body['parentId']) && $body['parentId'] !== null ? (int) $body['parentId'] : null;

    if ($name === '' || strlen($name) > 255) {
        json_out(['error' => 'Folder name is required.']);
    }
    if ($parentId !== null && !find_folder($pdo, $parentId)) {
        json_out(['error' => 'Parent folder not found.']);
    }

    $stmt = $pdo->prepare('INSERT INTO folders (name, parent_id, created_by, created_at) VALUES (?, ?, ?, NOW())');
    $stmt->execute([$name, $parentId, (int) $user['id']]);
    json_out(['ok' => true, 'folder' => ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'parentId' => $parentId]]);
}

function handle_delete_folder(PDO $pdo, array $body): void
{
    $id = (int) ($body['folderId'] ?? 0);
    if (!find_folder($pdo, $id)) {
        json_out(['error' => 'Folder not found.']);
    }
    $hasSubfolder = $pdo->prepare('SELECT 1 FROM folders WHERE parent_id = ?');
    $hasSubfolder->execute([$id]);
    $hasFile = $pdo->prepare('SELECT 1 FROM files WHERE folder_id = ?');
    $hasFile->execute([$id]);
    if ($hasSubfolder->fetchColumn() || $hasFile->fetchColumn()) {
        json_out(['error' => 'Folder is not empty — delete or move its contents first.']);
    }
    $pdo->prepare('DELETE FROM folders WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

function file_to_json(array $f, ?array $accessUserIds, ?string $path): array
{
    $out = [
        'id' => (int) $f['id'],
        'folderId' => $f['folder_id'] !== null ? (int) $f['folder_id'] : null,
        'filename' => $f['filename'],
        'sizeBytes' => (int) $f['size_bytes'],
        'uploadedAt' => $f['uploaded_at'],
    ];
    if ($accessUserIds !== null) $out['accessUserIds'] = $accessUserIds;
    if ($path !== null) $out['folderPath'] = $path;
    return $out;
}

function handle_list_files(PDO $pdo, array $user): void
{
    if ($user['role'] === 'admin') {
        $rows = $pdo->query('SELECT * FROM files ORDER BY uploaded_at DESC')->fetchAll();
        $accessStmt = $pdo->prepare('SELECT user_id FROM file_access WHERE file_id = ?');
        $out = [];
        foreach ($rows as $f) {
            $accessStmt->execute([$f['id']]);
            $accessUserIds = array_map('intval', array_column($accessStmt->fetchAll(), 'user_id'));
            $out[] = file_to_json($f, $accessUserIds, null);
        }
        json_out(['ok' => true, 'files' => $out]);
    }

    $stmt = $pdo->prepare('
        SELECT f.* FROM files f
        JOIN file_access a ON a.file_id = f.id
        WHERE a.user_id = ?
        ORDER BY f.uploaded_at DESC
    ');
    $stmt->execute([$user['id']]);
    $out = [];
    foreach ($stmt->fetchAll() as $f) {
        $out[] = file_to_json($f, null, folder_path($pdo, $f['folder_id'] !== null ? (int) $f['folder_id'] : null));
    }
    json_out(['ok' => true, 'files' => $out]);
}

function handle_upload_file(PDO $pdo, array $body, ?array $uploadedFile, array $user): void
{
    if (!$uploadedFile || ($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_out(['error' => 'No file uploaded, or the upload failed.']);
    }

    $folderId = isset($body['folderId']) && $body['folderId'] !== '' ? (int) $body['folderId'] : null;
    if ($folderId !== null && !find_folder($pdo, $folderId)) {
        json_out(['error' => 'Folder not found.']);
    }

    $originalName = basename((string) $uploadedFile['name']);
    $ext = pathinfo($originalName, PATHINFO_EXTENSION);
    $storageName = bin2hex(random_bytes(20)) . ($ext !== '' ? '.' . preg_replace('/[^a-zA-Z0-9]/', '', $ext) : '');

    if (!move_uploaded_file($uploadedFile['tmp_name'], UPLOAD_DIR . '/' . $storageName)) {
        json_out(['error' => 'Could not save the uploaded file on the server.']);
    }

    $stmt = $pdo->prepare('
        INSERT INTO files (folder_id, filename, storage_name, size_bytes, uploaded_by, uploaded_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    ');
    $stmt->execute([$folderId, $originalName, $storageName, (int) $uploadedFile['size'], (int) $user['id']]);

    $file = find_file($pdo, (int) $pdo->lastInsertId());
    json_out(['ok' => true, 'file' => file_to_json($file, [], null)]);
}

/* ---------------- document upload -> autofill the Add Client form ----------------
 * Free, no-API-key extraction: pulls the text layer straight out of the PDF
 * (no OCR, so a scanned/photographed page has no text to find) and matches
 * "Label: value" style lines against a set of known labels per field. Best-
 * effort by nature -- always shown to the user to review before creating
 * the client, never submitted on its own.
 */

const CLIENT_DOC_FIELD_LABELS = [
    'subscription' => [
        'clientName' => ['Client Name', 'Client', 'Customer Name', 'Customer', 'Company', 'Company Name', 'Name'],
        'softwareName' => ['Software Name', 'Software', 'Product', 'Product Name', 'Service'],
        'amount' => ['Plan Amount', 'Amount', 'Price', 'Fee', 'Subscription Amount'],
        'cycle' => ['Billing Cycle', 'Cycle'],
        'startDate' => ['Start Date', 'Date'],
    ],
    'normal' => [
        'clientName' => ['Client Name', 'Name', 'Customer Name', 'Customer'],
        'address' => ['Address'],
        'contact' => ['Contact', 'Contact Details', 'Phone', 'Mobile', 'Email'],
        'totalAmount' => ['Total Amount', 'Total', 'Amount'],
        'advancePayment' => ['Advance Payment', 'Advance', 'Paid', 'Amount Paid'],
        'notes' => ['Notes', 'Remarks', 'Other Details', 'Details'],
    ],
];

function pdf_extract_text(string $bytes): string
{
    if (!preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $bytes, $streams)) {
        return '';
    }

    $text = '';
    foreach ($streams[1] as $stream) {
        $decoded = @gzuncompress($stream);
        if ($decoded === false) {
            $decoded = @gzinflate($stream);
        }
        $content = $decoded !== false ? $decoded : $stream;

        // Walk the content stream in order: a paren string feeds the current
        // line, while a line-move operator (Td/TD/T*, the usual "next line"
        // operators between Tj calls) starts a new one -- otherwise every
        // Tj on a page collapses into a single run-on line.
        if (preg_match_all('/\((?:\\\\.|[^()\\\\])*\)|\bTd\b|\bTD\b|\bT\*/', $content, $tokens)) {
            foreach ($tokens[0] as $token) {
                if ($token[0] !== '(') {
                    $text .= "\n";
                    continue;
                }
                $inner = substr($token, 1, -1);
                $inner = preg_replace_callback('/\\\\([0-7]{1,3}|.)/', function ($m) {
                    $esc = $m[1];
                    if (preg_match('/^[0-7]{1,3}$/', $esc)) return chr(octdec($esc));
                    return ['n' => "\n", 'r' => "\r", 't' => "\t"][$esc] ?? $esc;
                }, $inner);
                $text .= $inner;
            }
        }
        $text .= "\n";
    }
    return $text;
}

function extract_client_fields_from_text(string $text, string $clientType): array
{
    $fields = [];
    $lines = preg_split('/\n+/', $text);
    $labelMap = CLIENT_DOC_FIELD_LABELS[$clientType];

    foreach ($lines as $line) {
        $line = trim(preg_replace('/\s+/', ' ', $line));
        if ($line === '') continue;
        foreach ($labelMap as $field => $labels) {
            if (isset($fields[$field])) continue;
            foreach ($labels as $label) {
                if (preg_match('/^' . preg_quote($label, '/') . '\s*[:\-]\s*(.+)$/i', $line, $m)) {
                    $fields[$field] = trim($m[1]);
                    break;
                }
            }
        }
    }

    // Contact: fall back to scanning the whole text for an email/phone if no
    // labelled line matched one.
    if ($clientType === 'normal' && empty($fields['contact'])) {
        $found = [];
        if (preg_match('/[\w.+-]+@[\w-]+\.[\w.-]+/', $text, $m)) $found[] = $m[0];
        if (preg_match('/(?:\+?\d[\d \-]{8,13}\d)/', $text, $m)) $found[] = trim($m[0]);
        if ($found) $fields['contact'] = implode(', ', $found);
    }

    // Amount-ish fields: find the actual number (comma thousands-separators
    // and all) rather than stripping non-digits, which would let a stray
    // period from a currency abbreviation like "Rs." corrupt the value.
    foreach (['amount', 'totalAmount', 'advancePayment'] as $moneyField) {
        if (isset($fields[$moneyField])) {
            if (preg_match('/\d[\d,]*(?:\.\d+)?/', $fields[$moneyField], $m)) {
                $fields[$moneyField] = (float) str_replace(',', '', $m[0]);
            } else {
                unset($fields[$moneyField]);
            }
        }
    }

    if (isset($fields['cycle'])) {
        $fields['cycle'] = stripos($fields['cycle'], 'year') !== false || stripos($fields['cycle'], 'annual') !== false
            ? 'Annual' : 'Monthly';
    }

    if (isset($fields['startDate'])) {
        $ts = strtotime($fields['startDate']);
        $fields['startDate'] = $ts !== false ? date('Y-m-d', $ts) : null;
        if ($fields['startDate'] === null) unset($fields['startDate']);
    }

    return $fields;
}

function handle_extract_client_document(PDO $pdo, array $body, ?array $uploadedFile): void
{
    if (!$uploadedFile || ($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_out(['error' => 'No file uploaded, or the upload failed.']);
    }
    if ($uploadedFile['size'] > 15 * 1024 * 1024) {
        json_out(['error' => 'File is too large (max 15 MB).']);
    }

    $clientType = ($body['clientType'] ?? '') === 'normal' ? 'normal' : 'subscription';

    $ext = strtolower(pathinfo((string) $uploadedFile['name'], PATHINFO_EXTENSION));
    if ($ext !== 'pdf') {
        json_out(['error' => 'Only PDF files are supported, and only ones with real (selectable) text — a scanned photo has no text to read.']);
    }

    $bytes = file_get_contents($uploadedFile['tmp_name']);
    $text = pdf_extract_text($bytes);
    if (trim($text) === '') {
        json_out(['error' => 'Could not find any text in that PDF — it looks like a scanned image rather than a text document.']);
    }

    $fields = extract_client_fields_from_text($text, $clientType);
    if (empty($fields)) {
        json_out(['error' => 'Could not recognize any client details in that PDF. Try a file with clear "Label: value" lines, e.g. "Client Name: ...".']);
    }

    json_out(['ok' => true, 'fields' => $fields]);
}

function handle_set_file_access(PDO $pdo, array $body): void
{
    $fileId = (int) ($body['fileId'] ?? 0);
    if (!find_file($pdo, $fileId)) {
        json_out(['error' => 'File not found.']);
    }
    $userIds = array_unique(array_map('intval', (array) ($body['userIds'] ?? [])));

    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM file_access WHERE file_id = ?')->execute([$fileId]);
    $insert = $pdo->prepare('INSERT INTO file_access (file_id, user_id) VALUES (?, ?)');
    foreach ($userIds as $uid) {
        $u = find_user_by_id($pdo, $uid);
        if ($u && $u['role'] === 'employee' && $u['status'] === 'active') {
            $insert->execute([$fileId, $uid]);
        }
    }
    $pdo->commit();
    json_out(['ok' => true]);
}

function handle_delete_file(PDO $pdo, array $body): void
{
    $fileId = (int) ($body['fileId'] ?? 0);
    $file = find_file($pdo, $fileId);
    if (!$file) {
        json_out(['error' => 'File not found.']);
    }
    $path = UPLOAD_DIR . '/' . $file['storage_name'];
    if (is_file($path)) {
        unlink($path);
    }
    $pdo->prepare('DELETE FROM file_access WHERE file_id = ?')->execute([$fileId]);
    $pdo->prepare('DELETE FROM files WHERE id = ?')->execute([$fileId]);
    json_out(['ok' => true]);
}

function handle_download_file(PDO $pdo, array $body, array $user): void
{
    $fileId = (int) ($body['fileId'] ?? 0);
    $file = find_file($pdo, $fileId);
    if (!$file) {
        json_out(['error' => 'File not found.']);
    }
    if ($user['role'] !== 'admin' && !has_file_access($pdo, $fileId, (int) $user['id'])) {
        json_out(['error' => 'You do not have access to this file.']);
    }
    $path = UPLOAD_DIR . '/' . $file['storage_name'];
    if (!is_file($path)) {
        json_out(['error' => 'File is missing on the server.']);
    }

    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . str_replace('"', '', $file['filename']) . '"');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

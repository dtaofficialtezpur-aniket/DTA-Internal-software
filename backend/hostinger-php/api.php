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
        'idPrefix' => $out['idPrefix'] ?? 'DTA-D',
        'idDigits' => (int) ($out['idDigits'] ?? 3),
    ];
}

// Builds a display id (client id or invoice number) from the admin's
// configured prefix/digit-count -- e.g. prefix "DTA-D", digits 3, n=7
// gives "DTA-D007". Changing the format only affects ids/numbers handed
// out from then on; nothing existing is renamed.
function format_display_id(array $settings, int $n): string
{
    return $settings['idPrefix'] . str_pad((string) $n, $settings['idDigits'], '0', STR_PAD_LEFT);
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

// One shared, sequential ID for every client, either type -- the first
// ever issued is DTA-D001, the next DTA-D002, and so on, regardless of
// whether it's a subscription or normal client -- and re-used once a
// client is deleted, so the count always reflects what currently exists
// rather than climbing forever. Finds the lowest free number across both
// tables. Existing clients keep their older DTA-CL-xxxx/DTA-NC-xxxx ids
// -- this only applies going forward.
function peek_next_client_id(PDO $pdo): string
{
    $settings = get_all_settings($pdo);
    $stmt = $pdo->prepare('SELECT 1 FROM clients WHERE id = ? UNION SELECT 1 FROM normal_clients WHERE id = ?');
    for ($n = 1; ; $n++) {
        $id = format_display_id($settings, $n);
        $stmt->execute([$id, $id]);
        if (!$stmt->fetchColumn()) return $id;
    }
}

// Same lookup as peek_next_client_id() -- there's no separate reservation
// step, so two people adding a client in the same instant could in theory
// race for the same number, in which case the second INSERT just fails on
// the primary key and that person retries. Not worth more machinery for a
// small team's usage pattern.
function gen_shared_client_id(PDO $pdo): string
{
    return peek_next_client_id($pdo);
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

// Decodes the archived_data column -- the other type's fields, saved off
// when a client was converted away from that type, so converting back
// restores them exactly. Null if this client has never been converted.
function decode_archived_data(array $c): ?array
{
    return !empty($c['archived_data']) ? json_decode($c['archived_data'], true) : null;
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
        'createdAt' => $c['created_at'] ?? null,
        'archivedNormalData' => decode_archived_data($c),
        'domain' => $c['domain'] ?? null,
        'websiteUrl' => $c['website_url'] ?? null,
        'domainExpiry' => $c['domain_expiry'] ?? null,
        'domainStart' => $c['domain_start'] ?? null,
    ];
}

/* ---------------- normal client helpers (basic-details clients) ---------------- */

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
        'paidAmount' => (float) ($c['paid_amount'] ?? 0),
        'remainingPayment' => (float) $c['remaining_payment'],
        'notes' => $c['notes'],
        'createdAt' => $c['created_at'],
        'archivedSubscriptionData' => decode_archived_data($c),
        'workStatus' => $c['work_status'] ?? null,
        'domain' => $c['domain'] ?? null,
        'websiteUrl' => $c['website_url'] ?? null,
        'domainExpiry' => $c['domain_expiry'] ?? null,
        'domainStart' => $c['domain_start'] ?? null,
    ];
}

/* ---------------- invoices ---------------- */

function invoice_to_json(array $i, array $settings): array
{
    return [
        'id' => (int) $i['id'],
        'number' => !empty($i['invoice_number']) ? $i['invoice_number'] : format_display_id($settings, (int) $i['id']),
        'clientType' => $i['client_type'],
        'clientId' => $i['client_id'],
        'client' => $i['client_name'],
        'description' => $i['description'],
        'amount' => (float) $i['amount'],
        'issuedAt' => $i['issued_date'],
        'createdBy' => (int) $i['created_by'],
    ];
}

// Invoice numbers are the client's own id plus a per-client counter, e.g.
// DTA-D002-01, DTA-D002-02 -- so the number alone says which client it is for.
function next_invoice_number(PDO $pdo, string $clientId): string
{
    $count = $pdo->prepare('SELECT COUNT(*) FROM invoices WHERE client_id = ?');
    $count->execute([$clientId]);
    $n = (int) $count->fetchColumn() + 1;
    $taken = $pdo->prepare('SELECT 1 FROM invoices WHERE invoice_number = ?');
    while (true) {
        $number = $clientId . '-' . str_pad((string) $n, 2, '0', STR_PAD_LEFT);
        $taken->execute([$number]);
        if (!$taken->fetchColumn()) return $number;
        $n++;
    }
}

function handle_next_invoice_number(PDO $pdo, array $body): void
{
    $clientId = (string) ($body['clientId'] ?? '');
    if (!client_exists($pdo, $clientId)) json_out(['error' => 'Client not found: ' . $clientId]);
    json_out(['ok' => true, 'number' => next_invoice_number($pdo, $clientId)]);
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

    $number = next_invoice_number($pdo, $clientId);
    $stmt = $pdo->prepare('
        INSERT INTO invoices (client_type, client_id, client_name, description, amount, issued_date, created_by, invoice_number)
        VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)
    ');
    $stmt->execute([$clientType, $clientId, $clientName, $description, $amount, (int) $user['id'], $number]);
    $id = (int) $pdo->lastInsertId();

    $settings = get_all_settings($pdo);
    log_event($pdo, $clientId, 'invoiced', 'Invoice ' . $number . ' generated for ' . number_format($amount, 2));

    $stmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
    $stmt->execute([$id]);
    json_out(['ok' => true, 'invoice' => invoice_to_json($stmt->fetch(), $settings)]);
}

function handle_list_invoices(PDO $pdo, array $body): void
{
    $clientType = ($body['clientType'] ?? '') === 'normal' ? 'normal' : 'subscription';
    $clientId = (string) ($body['clientId'] ?? '');
    $stmt = $pdo->prepare('SELECT * FROM invoices WHERE client_type = ? AND client_id = ? ORDER BY issued_date DESC, id DESC');
    $stmt->execute([$clientType, $clientId]);
    $settings = get_all_settings($pdo);
    $rows = array_map(function ($i) use ($settings) { return invoice_to_json($i, $settings); }, $stmt->fetchAll());
    json_out(['ok' => true, 'invoices' => $rows]);
}

// The person who generated an invoice, or the admin, can delete it. Only the
// record goes (the PDF is never stored); it's noted in the client's history.
function handle_delete_invoice(PDO $pdo, array $body, array $user): void
{
    $stmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
    $stmt->execute([(int) ($body['invoiceId'] ?? 0)]);
    $inv = $stmt->fetch();
    if (!$inv) json_out(['error' => 'Invoice not found.']);
    if ($user['role'] !== 'admin' && (int) $inv['created_by'] !== (int) $user['id']) {
        json_out(['error' => 'Only the admin or the person who generated this invoice can delete it.']);
    }
    $pdo->prepare('DELETE FROM invoices WHERE id = ?')->execute([$inv['id']]);
    $number = invoice_to_json($inv, get_all_settings($pdo))['number'];
    log_event($pdo, $inv['client_id'], 'updated', 'Invoice ' . $number . ' deleted');
    json_out(['ok' => true]);
}

/* ---------------- admin: id format + direct id edits ---------------- */

// Admin-only: changes the prefix/digit-count used for ids handed out to
// NEW clients and invoices from now on. Never renames anything that
// already exists -- see handle_update_client_id() for that.
function handle_update_id_format(PDO $pdo, array $body): void
{
    $prefix = trim((string) ($body['idPrefix'] ?? ''));
    $digits = (int) ($body['idDigits'] ?? 3);

    if ($prefix === '' || strlen($prefix) > 20 || !preg_match('/^[A-Za-z0-9_-]+$/', $prefix)) {
        json_out(['error' => 'ID prefix must be 1-20 letters, numbers, - or _ only.']);
    }
    if ($digits < 1 || $digits > 6) {
        json_out(['error' => 'Digit count must be between 1 and 6.']);
    }

    set_setting($pdo, 'idPrefix', $prefix);
    set_setting($pdo, 'idDigits', (string) $digits);
    json_out(['ok' => true, 'settings' => get_all_settings($pdo)]);
}

// Admin-only: directly renames one existing client's id (either type).
// The id is a shared primary key across 'clients'/'normal_clients' plus
// a plain string reference in 'history' and 'invoices' (no real FK
// constraints), so this updates all three under one transaction. For a
// subscription client the api_key is untouched -- but its deployed
// software authenticates with client_id + api_key together, so changing
// the id breaks that connection until the software is reconfigured with
// the new id. The frontend warns about this before calling in.
function handle_update_client_id(PDO $pdo, array $body): void
{
    $clientType = ($body['clientType'] ?? '') === 'normal' ? 'normal' : 'subscription';
    $oldId = trim((string) ($body['id'] ?? ''));
    $newId = trim((string) ($body['newId'] ?? ''));

    if ($newId === '' || strlen($newId) > 32 || !preg_match('/^[A-Za-z0-9_-]+$/', $newId)) {
        json_out(['error' => 'Client ID must be 1-32 letters, numbers, - or _ only.']);
    }

    $table = $clientType === 'normal' ? 'normal_clients' : 'clients';
    $existing = $clientType === 'normal' ? find_normal_client($pdo, $oldId) : find_client($pdo, $oldId);
    if (!$existing) {
        json_out(['error' => 'Client not found: ' . $oldId]);
    }

    if ($newId === $oldId) {
        json_out(['ok' => true, 'client' => $clientType === 'normal' ? normal_client_to_json($existing) : client_to_json($existing)]);
    }

    // Shared id namespace across both tables -- the new id must be free everywhere.
    $check = $pdo->prepare('SELECT 1 FROM clients WHERE id = ? UNION SELECT 1 FROM normal_clients WHERE id = ?');
    $check->execute([$newId, $newId]);
    if ($check->fetchColumn()) {
        json_out(['error' => 'That ID is already in use: ' . $newId]);
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE {$table} SET id = ? WHERE id = ?")->execute([$newId, $oldId]);
        $pdo->prepare('UPDATE history SET client_id = ? WHERE client_id = ?')->execute([$newId, $oldId]);
        $pdo->prepare('UPDATE invoices SET client_id = ? WHERE client_id = ? AND client_type = ?')->execute([$newId, $oldId, $clientType]);
        $pdo->prepare('UPDATE client_links SET client_id = ? WHERE client_id = ?')->execute([$newId, $oldId]);
        $pdo->prepare('UPDATE client_documents SET client_id = ? WHERE client_id = ?')->execute([$newId, $oldId]);
        $pdo->prepare('UPDATE payments SET client_id = ? WHERE client_id = ?')->execute([$newId, $oldId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        json_out(['error' => 'Could not change the ID: ' . $e->getMessage()]);
    }

    log_event($pdo, $newId, 'id_changed', 'Client ID changed from ' . $oldId . ' to ' . $newId . ' by admin');

    $updated = $clientType === 'normal' ? find_normal_client($pdo, $newId) : find_client($pdo, $newId);
    json_out(['ok' => true, 'client' => $clientType === 'normal' ? normal_client_to_json($updated) : client_to_json($updated)]);
}

// Links are rendered as clickable hrefs in the dashboard, so only plain
// http(s) addresses are accepted -- never javascript:/data: or anything with
// spaces or quote characters.
function valid_http_url(string $url): bool
{
    $p = parse_url($url);
    return strlen($url) <= 500 && !preg_match('/[\s"\'<>\\\\]/', $url) && $p
        && in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) && !empty($p['host']);
}

function client_exists(PDO $pdo, string $id): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM clients WHERE id = ? UNION SELECT 1 FROM normal_clients WHERE id = ?');
    $stmt->execute([$id, $id]);
    return (bool) $stmt->fetchColumn();
}

function record_payment(PDO $pdo, string $clientId, string $type, string $name, float $amount, string $kind, string $note): void
{
    if (abs($amount) < 0.01) return;
    $pdo->prepare('INSERT INTO payments (client_id, client_type, client_name, amount, paid_at, kind, note) VALUES (?, ?, ?, ?, NOW(), ?, ?)')
        ->execute([$clientId, $type, $name, round($amount, 2), $kind, $note]);
}

function handle_list_payments(PDO $pdo): void
{
    $rows = $pdo->query('SELECT * FROM payments ORDER BY paid_at DESC, id DESC')->fetchAll();
    json_out(['ok' => true, 'payments' => array_map('payment_to_json', $rows)]);
}

function payment_to_json(array $p): array
{
    $deleted = str_starts_with($p['client_id'], 'deleted:');
    return [
        'id' => (int) $p['id'],
        'clientId' => $deleted ? substr($p['client_id'], 8) : $p['client_id'],
        'clientDeleted' => $deleted,
        'clientType' => $p['client_type'],
        'client' => $p['client_name'],
        'amount' => (float) $p['amount'],
        'paidAt' => $p['paid_at'],
        'kind' => $p['kind'],
        'note' => $p['note'],
    ];
}

function handle_list_client_payments(PDO $pdo, array $body): void
{
    $stmt = $pdo->prepare('SELECT * FROM payments WHERE client_id = ? ORDER BY paid_at DESC, id DESC');
    $stmt->execute([(string) ($body['clientId'] ?? '')]);
    json_out(['ok' => true, 'payments' => array_map('payment_to_json', $stmt->fetchAll())]);
}

// Admin-only: removes one payment record (e.g. one entered twice) and, for a
// normal client, takes it back out of their paid/advance amount so the
// client's balance and the revenue figures stay in step. A subscription
// renewal's record is removed but its due date is left as it is.
function handle_delete_payment(PDO $pdo, array $body): void
{
    $stmt = $pdo->prepare('SELECT * FROM payments WHERE id = ?');
    $stmt->execute([(int) ($body['paymentId'] ?? 0)]);
    $p = $stmt->fetch();
    if (!$p) json_out(['error' => 'Payment not found.']);

    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM payments WHERE id = ?')->execute([$p['id']]);
    $c = find_normal_client($pdo, $p['client_id']);
    if ($c && $p['client_type'] === 'normal') {
        $advance = (float) $c['advance_payment'];
        $paid = (float) $c['paid_amount'];
        if ($p['kind'] === 'payment') $paid = max(0, $paid - (float) $p['amount']);
        else $advance = max(0, $advance - (float) $p['amount']);
        $remaining = max(0, (float) $c['total_amount'] - $advance - $paid);
        $pdo->prepare('UPDATE normal_clients SET advance_payment = ?, paid_amount = ?, remaining_payment = ? WHERE id = ?')
            ->execute([$advance, $paid, $remaining, $c['id']]);
    }
    $pdo->commit();

    if (!str_starts_with($p['client_id'], 'deleted:')) {
        log_event($pdo, $p['client_id'], 'updated', 'Payment record of ' . number_format((float) $p['amount'], 2) . ' removed');
    }
    json_out(['ok' => true]);
}

// Removes a client's links and documents (including the files on disk).
// Called when the client itself is deleted.
function purge_client_extras(PDO $pdo, string $id): void
{
    $pdo->prepare("UPDATE payments SET client_id = CONCAT('deleted:', client_id) WHERE client_id = ?")->execute([$id]);
    $pdo->prepare('DELETE FROM client_links WHERE client_id = ?')->execute([$id]);
    $stmt = $pdo->prepare('SELECT storage_name FROM client_documents WHERE client_id = ?');
    $stmt->execute([$id]);
    foreach ($stmt->fetchAll() as $d) {
        $path = UPLOAD_DIR . '/' . $d['storage_name'];
        if (is_file($path)) unlink($path);
    }
    $pdo->prepare('DELETE FROM client_documents WHERE client_id = ?')->execute([$id]);
}

/* ---------------- constants ----------------
 * Must be declared before the request handling below: top-level const
 * statements only run when execution reaches them, and every request
 * ends (exit) inside that handling.
 */

const NORMAL_WORK_STATUSES = [
    'advance_received' => 'Advance payment received',
    'in_progress' => 'Work in progress',
    'domain_bought' => 'Domain bought',
    'work_done' => 'Work done',
    'handover_done' => 'Handover done',
];

const CLIENT_DOC_MAX_BYTES = 25 * 1024 * 1024;
const CLIENT_DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf',
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'zip'];

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
    } elseif ($action === 'uploadClientDocument') {
        $user = require_session($pdo, $_POST['token'] ?? null);
        handle_upload_client_document($pdo, $_POST, $_FILES['file'] ?? null, $user);
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
        case 'peekNextClientId':
            require_session($pdo, $body['token'] ?? null);
            json_out(['ok' => true, 'id' => peek_next_client_id($pdo)]);
            break;
        case 'convertToSubscription':
            require_session($pdo, $body['token'] ?? null);
            handle_convert_to_subscription($pdo, $body);
            break;
        case 'convertToNormal':
            require_session($pdo, $body['token'] ?? null);
            handle_convert_to_normal($pdo, $body);
            break;
        case 'addClientLink':
            require_session($pdo, $body['token'] ?? null);
            handle_add_client_link($pdo, $body);
            break;
        case 'deleteClientLink':
            require_session($pdo, $body['token'] ?? null);
            handle_delete_client_link($pdo, $body);
            break;
        case 'listClientDocuments':
            require_session($pdo, $body['token'] ?? null);
            handle_list_client_documents($pdo, $body);
            break;
        case 'downloadClientDocument':
            require_session($pdo, $body['token'] ?? null);
            handle_download_client_document($pdo, $body);
            break;
        case 'deleteClientDocument':
            handle_delete_client_document($pdo, $body, require_session($pdo, $body['token'] ?? null));
            break;
        case 'updateClientDomain':
            require_session($pdo, $body['token'] ?? null);
            handle_update_client_domain($pdo, $body);
            break;
        case 'addNormalClient':
            require_session($pdo, $body['token'] ?? null);
            handle_add_normal_client($pdo, $body);
            break;
        case 'setNormalClientStatus':
            require_session($pdo, $body['token'] ?? null);
            handle_set_normal_client_status($pdo, $body);
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
        case 'nextInvoiceNumber':
            require_session($pdo, $body['token'] ?? null);
            handle_next_invoice_number($pdo, $body);
            break;
        case 'deleteInvoice':
            handle_delete_invoice($pdo, $body, require_session($pdo, $body['token'] ?? null));
            break;
        case 'listInvoices':
            require_session($pdo, $body['token'] ?? null);
            handle_list_invoices($pdo, $body);
            break;

        // Admin-only team management.
        case 'listClientPayments':
            require_session($pdo, $body['token'] ?? null);
            handle_list_client_payments($pdo, $body);
            break;
        case 'deletePayment':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_delete_payment($pdo, $body);
            break;
        case 'listPayments':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_list_payments($pdo);
            break;
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
        case 'updateIdFormat':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_update_id_format($pdo, $body);
            break;
        case 'updateClientId':
            require_admin_session($pdo, $body['token'] ?? null);
            handle_update_client_id($pdo, $body);
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

    $linksByClient = [];
    foreach ($pdo->query('SELECT id, client_id, label, url FROM client_links ORDER BY id ASC')->fetchAll() as $l) {
        $linksByClient[$l['client_id']][] = ['id' => (int) $l['id'], 'label' => $l['label'], 'url' => $l['url']];
    }
    foreach ($out as $i => $row) {
        $out[$i]['links'] = $linksByClient[$row['id']] ?? [];
    }

    $normalClients = $pdo->query('SELECT * FROM normal_clients ORDER BY created_at DESC')->fetchAll();
    $normalOut = [];
    foreach ($normalClients as $c) {
        $json = normal_client_to_json($c);
        $historyStmt->execute([$c['id']]);
        $json['history'] = array_map(function ($h) {
            return ['clientId' => $h['client_id'], 'timestamp' => $h['ts'], 'action' => $h['action'], 'note' => $h['note']];
        }, $historyStmt->fetchAll());
        $json['links'] = $linksByClient[$c['id']] ?? [];
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

    $id = gen_shared_client_id($pdo);
    $apiKey = gen_api_key();
    $settings = get_all_settings($pdo);

    $cycle = ($body['cycle'] ?? '') === 'Annual' ? 'Annual' : 'Monthly';
    $start = !empty($body['start']) ? $body['start'] : date('Y-m-d');
    $grace = isset($body['grace']) ? (int) $body['grace'] : $settings['defaultGrace'];
    $days = $cycle === 'Annual' ? 365 : 30;
    $nextDue = date('Y-m-d', strtotime("{$start} +{$days} days"));

    $stmt = $pdo->prepare('
        INSERT INTO clients (id, api_key, client_name, software, cycle, amount, start_date, next_due, grace_days, status, paused_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW())
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
    record_payment($pdo, $id, 'subscription', $c['client_name'], (float) $c['amount'], 'renewal', 'Subscription renewal');
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

    $id = gen_shared_client_id($pdo);
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
    record_payment($pdo, $id, 'normal', substr($clientName, 0, 255), $advancePayment, 'advance', 'Advance payment');

    $c = find_normal_client($pdo, $id);
    json_out(['ok' => true, 'client' => normal_client_to_json($c)]);
}

function handle_set_normal_client_status(PDO $pdo, array $body): void
{
    $id = (string) ($body['id'] ?? '');
    if (!find_normal_client($pdo, $id)) json_out(['error' => 'Client not found: ' . $id]);

    $status = (string) ($body['status'] ?? '');
    if ($status !== '' && !isset(NORMAL_WORK_STATUSES[$status])) {
        json_out(['error' => 'Unknown status.']);
    }
    $pdo->prepare('UPDATE normal_clients SET work_status = ? WHERE id = ?')->execute([$status !== '' ? $status : null, $id]);
    log_event($pdo, $id, 'updated', $status !== '' ? 'Status set to ' . NORMAL_WORK_STATUSES[$status] : 'Status cleared');
    json_out(['ok' => true, 'client' => normal_client_to_json(find_normal_client($pdo, $id))]);
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
    $paidAmount = (float) $c['paid_amount'];
    if ($advancePayment + $paidAmount > $totalAmount + 0.001) {
        json_out(['error' => 'Advance plus amount already paid (' . number_format($paidAmount, 2) . ') cannot be more than the total amount.']);
    }
    $remainingPayment = max(0, $totalAmount - $advancePayment - $paidAmount);

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
    record_payment($pdo, $id, 'normal', substr($clientName, 0, 255), $advancePayment - (float) $c['advance_payment'], 'adjustment', 'Advance changed in client details');
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

    if ($amount > (float) $c['remaining_payment'] + 0.001) {
        json_out(['error' => 'Payment is more than the remaining amount (' . number_format((float) $c['remaining_payment'], 2) . ').']);
    }
    $paidAmount = (float) $c['paid_amount'] + $amount;
    $remainingPayment = max(0, (float) $c['total_amount'] - (float) $c['advance_payment'] - $paidAmount);

    $stmt = $pdo->prepare('UPDATE normal_clients SET paid_amount = ?, remaining_payment = ? WHERE id = ?');
    $stmt->execute([$paidAmount, $remainingPayment, $id]);

    log_event($pdo, $id, 'paid', 'Payment of ' . number_format($amount, 2) . ' recorded');
    record_payment($pdo, $id, 'normal', $c['client_name'], $amount, 'payment', 'Payment');
    json_out(['ok' => true, 'client' => normal_client_to_json(find_normal_client($pdo, $id))]);
}

function handle_delete_normal_client(PDO $pdo, array $body): void
{
    $id = $body['id'] ?? '';
    $c = find_normal_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    purge_client_extras($pdo, $id);
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

    purge_client_extras($pdo, $id);
    $stmt = $pdo->prepare('DELETE FROM clients WHERE id = ?');
    $stmt->execute([$id]);
    $del = $pdo->prepare('DELETE FROM history WHERE client_id = ?');
    $del->execute([$id]);

    json_out(['ok' => true]);
}

/* ---------------- converting between client types ----------------
 * Moves a client's row from one table to the other, keeping its id and
 * name. Whatever fields don't exist on the new type get saved into the
 * row's own archived_data column, so converting back restores them
 * exactly -- including, for subscription clients, the original API key,
 * so a license that depended on it keeps working again after an undo.
 * History rows aren't touched at all: they're keyed by this same id, so
 * they stay attached regardless of which table currently owns it.
 */

function handle_convert_to_subscription(PDO $pdo, array $body): void
{
    $id = (string) ($body['id'] ?? '');
    $c = find_normal_client($pdo, $id);
    if (!$c) json_out(['error' => 'Normal client not found: ' . $id]);

    $archived = decode_archived_data($c);
    if ($archived && ($archived['_type'] ?? '') === 'subscription') {
        // Undoing a previous subscription->normal conversion: restore
        // everything exactly, API key included.
        $apiKey = $archived['apiKey'];
        $software = $archived['software'];
        $cycle = $archived['cycle'];
        $amount = (float) $archived['amount'];
        $start = $archived['start'];
        $nextDue = $archived['nextDue'];
        $grace = (int) $archived['grace'];
        $status = $archived['status'];
        $pausedAt = $archived['pausedAt'];
    } else {
        $software = trim((string) ($body['software'] ?? ''));
        if ($software === '') {
            json_out(['error' => 'Software name is required.']);
        }
        $amount = (float) ($body['amount'] ?? $c['total_amount']);
        if ($amount <= 0) {
            json_out(['error' => 'Plan amount must be greater than zero.']);
        }
        $apiKey = gen_api_key();
        $cycle = ($body['cycle'] ?? '') === 'Annual' ? 'Annual' : 'Monthly';
        $start = !empty($body['start']) ? $body['start'] : date('Y-m-d');
        $settings = get_all_settings($pdo);
        $grace = isset($body['grace']) ? (int) $body['grace'] : $settings['defaultGrace'];
        $days = $cycle === 'Annual' ? 365 : 30;
        $nextDue = date('Y-m-d', strtotime("{$start} +{$days} days"));
        $status = 'active';
        $pausedAt = null;
    }

    $archiveNormal = json_encode([
        '_type' => 'normal',
        'address' => $c['address'], 'contact' => $c['contact'],
        'totalAmount' => (float) $c['total_amount'], 'advancePayment' => (float) $c['advance_payment'],
        'paidAmount' => (float) ($c['paid_amount'] ?? 0),
        'notes' => $c['notes'], 'createdAt' => $c['created_at'], 'workStatus' => $c['work_status'] ?? null,
    ]);

    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM normal_clients WHERE id = ?')->execute([$id]);
    $stmt = $pdo->prepare('
        INSERT INTO clients (id, api_key, client_name, software, cycle, amount, start_date, next_due, grace_days, status, paused_at, archived_data, domain, website_url, domain_expiry, domain_start, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([$id, $apiKey, $c['client_name'], $software, $cycle, $amount, $start, $nextDue, $grace, $status, $pausedAt, $archiveNormal, $c['domain'], $c['website_url'], $c['domain_expiry'], $c['domain_start'] ?? null, $c['created_at']]);
    $pdo->commit();

    log_event($pdo, $id, 'converted', 'Converted from normal client to subscription client');
    json_out(['ok' => true, 'client' => client_to_json(find_client($pdo, $id))]);
}

function handle_convert_to_normal(PDO $pdo, array $body): void
{
    $id = (string) ($body['id'] ?? '');
    $c = find_client($pdo, $id);
    if (!$c) json_out(['error' => 'Subscription client not found: ' . $id]);

    $archived = decode_archived_data($c);
    if ($archived && ($archived['_type'] ?? '') === 'normal') {
        $address = $archived['address'];
        $contact = $archived['contact'];
        $totalAmount = (float) $archived['totalAmount'];
        $advancePayment = (float) $archived['advancePayment'];
        $paidAmount = (float) ($archived['paidAmount'] ?? 0);
        $notes = $archived['notes'];
        $createdAt = $archived['createdAt'] ?? null;
        $workStatus = $archived['workStatus'] ?? null;
    } else {
        $workStatus = null;
        $paidAmount = 0.0;
        $address = substr((string) ($body['address'] ?? ''), 0, 2000);
        $contact = substr((string) ($body['contact'] ?? ''), 0, 255);
        $totalAmount = max(0, (float) ($body['totalAmount'] ?? $c['amount']));
        $advancePayment = max(0, (float) ($body['advancePayment'] ?? 0));
        if ($advancePayment > $totalAmount) {
            json_out(['error' => 'Advance payment cannot be more than the total amount.']);
        }
        $notes = substr((string) ($body['notes'] ?? ''), 0, 2000);
        $createdAt = null;
    }
    $remainingPayment = max(0, $totalAmount - $advancePayment - $paidAmount);

    $archiveSub = json_encode([
        '_type' => 'subscription',
        'apiKey' => $c['api_key'], 'software' => $c['software'], 'cycle' => $c['cycle'],
        'amount' => (float) $c['amount'], 'start' => $c['start_date'], 'nextDue' => $c['next_due'],
        'grace' => (int) $c['grace_days'], 'status' => $c['status'], 'pausedAt' => $c['paused_at'],
    ]);

    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM clients WHERE id = ?')->execute([$id]);
    $stmt = $pdo->prepare('
        INSERT INTO normal_clients (id, client_name, address, contact, total_amount, advance_payment, paid_amount, remaining_payment, notes, created_at, archived_data, domain, website_url, domain_expiry, domain_start, work_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([$id, $c['client_name'], $address, $contact, $totalAmount, $advancePayment, $paidAmount, $remainingPayment, $notes, $createdAt ?? $c['created_at'] ?? date('Y-m-d H:i:s'), $archiveSub, $c['domain'], $c['website_url'], $c['domain_expiry'], $c['domain_start'] ?? null, $workStatus]);
    $pdo->commit();

    if (!($archived && ($archived['_type'] ?? '') === 'normal')) {
        record_payment($pdo, $id, 'normal', $c['client_name'], $advancePayment, 'advance', 'Advance payment');
    }
    log_event($pdo, $id, 'converted', 'Converted from subscription client to normal client');
    json_out(['ok' => true, 'client' => normal_client_to_json(find_normal_client($pdo, $id))]);
}

// Domain/website details for either client type. The website link is shown
// as a clickable href in the dashboard, so only plain http(s) links are
// accepted -- never javascript:/data: or anything with spaces/quotes.
function handle_update_client_domain(PDO $pdo, array $body): void
{
    $clientType = ($body['clientType'] ?? '') === 'normal' ? 'normal' : 'subscription';
    $id = (string) ($body['id'] ?? '');
    $c = $clientType === 'normal' ? find_normal_client($pdo, $id) : find_client($pdo, $id);
    if (!$c) json_out(['error' => 'Client not found: ' . $id]);

    $domain = strtolower(trim((string) ($body['domain'] ?? '')));
    if ($domain !== '' && (strlen($domain) > 255 || !preg_match('/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/', $domain))) {
        json_out(['error' => 'Domain looks invalid. Use just the name, e.g. example.com']);
    }

    $url = trim((string) ($body['websiteUrl'] ?? ''));
    if ($url !== '') {
        if (!valid_http_url($url)) {
            json_out(['error' => 'Website link must be a valid http:// or https:// address.']);
        }
    }

    $expiry = trim((string) ($body['domainExpiry'] ?? ''));
    if ($expiry !== '') {
        $d = DateTime::createFromFormat('Y-m-d', $expiry);
        if (!$d || $d->format('Y-m-d') !== $expiry) {
            json_out(['error' => 'Domain expiry must be a date (YYYY-MM-DD).']);
        }
    }

    $started = trim((string) ($body['domainStart'] ?? ''));
    if ($started !== '') {
        $d = DateTime::createFromFormat('Y-m-d', $started);
        if (!$d || $d->format('Y-m-d') !== $started) {
            json_out(['error' => 'Domain registration date must be a date (YYYY-MM-DD).']);
        }
        if ($expiry !== '' && $started > $expiry) {
            json_out(['error' => 'Domain registration date must be before the expiry date.']);
        }
    }

    $table = $clientType === 'normal' ? 'normal_clients' : 'clients';
    $pdo->prepare("UPDATE {$table} SET domain = ?, website_url = ?, domain_expiry = ?, domain_start = ? WHERE id = ?")
        ->execute([$domain !== '' ? $domain : null, $url !== '' ? $url : null, $expiry !== '' ? $expiry : null, $started !== '' ? $started : null, $id]);

    log_event($pdo, $id, 'updated', 'Domain details updated');
    $updated = $clientType === 'normal' ? find_normal_client($pdo, $id) : find_client($pdo, $id);
    json_out(['ok' => true, 'client' => $clientType === 'normal' ? normal_client_to_json($updated) : client_to_json($updated)]);
}

/* ---------------- client links + documents ---------------- */

function handle_add_client_link(PDO $pdo, array $body): void
{
    $id = (string) ($body['id'] ?? '');
    if (!client_exists($pdo, $id)) json_out(['error' => 'Client not found: ' . $id]);

    $label = trim((string) ($body['label'] ?? ''));
    if ($label === '' || mb_strlen($label) > 100) {
        json_out(['error' => 'Give the link a name (up to 100 characters).']);
    }
    $url = trim((string) ($body['url'] ?? ''));
    if (!valid_http_url($url)) {
        json_out(['error' => 'Link must be a valid http:// or https:// address.']);
    }

    $pdo->prepare('INSERT INTO client_links (client_id, label, url, created_at) VALUES (?, ?, ?, NOW())')
        ->execute([$id, $label, $url]);
    log_event($pdo, $id, 'updated', 'Link added: ' . $label);
    json_out(['ok' => true]);
}

function handle_delete_client_link(PDO $pdo, array $body): void
{
    $stmt = $pdo->prepare('SELECT * FROM client_links WHERE id = ?');
    $stmt->execute([(int) ($body['linkId'] ?? 0)]);
    $l = $stmt->fetch();
    if (!$l) json_out(['error' => 'Link not found.']);
    $pdo->prepare('DELETE FROM client_links WHERE id = ?')->execute([$l['id']]);
    log_event($pdo, $l['client_id'], 'updated', 'Link removed: ' . $l['label']);
    json_out(['ok' => true]);
}

function client_document_to_json(array $d): array
{
    return [
        'id' => (int) $d['id'],
        'filename' => $d['filename'],
        'size' => (int) $d['size_bytes'],
        'uploadedAt' => $d['uploaded_at'],
        'uploadedBy' => (int) $d['uploaded_by'],
    ];
}

function find_client_document(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM client_documents WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function handle_list_client_documents(PDO $pdo, array $body): void
{
    $stmt = $pdo->prepare('SELECT * FROM client_documents WHERE client_id = ? ORDER BY uploaded_at DESC, id DESC');
    $stmt->execute([(string) ($body['clientId'] ?? '')]);
    json_out(['ok' => true, 'documents' => array_map('client_document_to_json', $stmt->fetchAll())]);
}

function handle_upload_client_document(PDO $pdo, array $body, ?array $uploadedFile, array $user): void
{
    $clientId = (string) ($body['clientId'] ?? '');
    if (!client_exists($pdo, $clientId)) json_out(['error' => 'Client not found: ' . $clientId]);
    if (!$uploadedFile || ($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_out(['error' => 'No file uploaded, or the upload failed (it may be larger than the server allows).']);
    }
    if ((int) $uploadedFile['size'] > CLIENT_DOC_MAX_BYTES) {
        json_out(['error' => 'That file is too large (25 MB maximum).']);
    }

    $originalName = substr(basename((string) $uploadedFile['name']), 0, 255);
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if (!in_array($ext, CLIENT_DOC_EXTENSIONS, true)) {
        json_out(['error' => 'That file type is not allowed. Use PDF, Word, Excel, PowerPoint, text, image or ZIP files.']);
    }
    $storageName = bin2hex(random_bytes(20)) . '.' . $ext;
    if (!move_uploaded_file($uploadedFile['tmp_name'], UPLOAD_DIR . '/' . $storageName)) {
        json_out(['error' => 'Could not save the uploaded file on the server.']);
    }

    $pdo->prepare('INSERT INTO client_documents (client_id, filename, storage_name, size_bytes, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, NOW())')
        ->execute([$clientId, $originalName, $storageName, (int) $uploadedFile['size'], (int) $user['id']]);
    log_event($pdo, $clientId, 'updated', 'Document uploaded: ' . $originalName);
    json_out(['ok' => true]);
}

function handle_download_client_document(PDO $pdo, array $body): void
{
    $d = find_client_document($pdo, (int) ($body['docId'] ?? 0));
    if (!$d) json_out(['error' => 'Document not found.']);
    $path = UPLOAD_DIR . '/' . $d['storage_name'];
    if (!is_file($path)) json_out(['error' => 'File is missing on the server.']);

    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . str_replace(['"', "\r", "\n"], '', $d['filename']) . '"');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

// The person who uploaded a document, or the admin, can delete it.
function handle_delete_client_document(PDO $pdo, array $body, array $user): void
{
    $d = find_client_document($pdo, (int) ($body['docId'] ?? 0));
    if (!$d) json_out(['error' => 'Document not found.']);
    if ($user['role'] !== 'admin' && (int) $d['uploaded_by'] !== (int) $user['id']) {
        json_out(['error' => 'Only the admin or the person who uploaded this can delete it.']);
    }
    $path = UPLOAD_DIR . '/' . $d['storage_name'];
    if (is_file($path)) unlink($path);
    $pdo->prepare('DELETE FROM client_documents WHERE id = ?')->execute([$d['id']]);
    log_event($pdo, $d['client_id'], 'updated', 'Document removed: ' . $d['filename']);
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

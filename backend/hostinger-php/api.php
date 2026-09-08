<?php
/**
 * DTA Subscription Control — PHP/MySQL backend for Hostinger shared hosting.
 *
 * Same request/response contract as backend/google-apps-script/Code.gs, so
 * the dashboard and desktop app work unchanged — only the Backend URL in
 * Settings needs to change. Mirror any change to the Apps Script version
 * here too (and vice versa).
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

function require_admin(PDO $pdo, ?string $key): void
{
    if (!$key) {
        json_out(['error' => 'Missing admin key.']);
    }
    $stored = get_setting($pdo, 'adminKey');
    if (!$stored || !hash_equals($stored, $key)) {
        json_out(['error' => 'Invalid or missing admin key.']);
    }
}

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
    return substr($mysqlDateTime, 0, 10); // YYYY-MM-DD
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
        json_out(['error' => 'Unknown or missing action for GET. Use POST for admin actions.']);
    }
    handle_status($pdo, $_GET);
} elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $body['action'] ?? null;

    if ($action === 'status') {
        handle_status($pdo, $body);
    }

    require_admin($pdo, $body['adminKey'] ?? null);

    switch ($action) {
        case 'list':
            handle_list($pdo);
            break;
        case 'add':
            handle_add($pdo, $body);
            break;
        case 'pause':
            handle_pause($pdo, $body);
            break;
        case 'resume':
            handle_resume($pdo, $body);
            break;
        case 'markPaid':
            handle_mark_paid($pdo, $body);
            break;
        case 'regenerateKey':
            handle_regenerate_key($pdo, $body);
            break;
        case 'updateSettings':
            handle_update_settings($pdo, $body);
            break;
        case 'getSettings':
            json_out(get_all_settings($pdo));
            break;
        default:
            json_out(['error' => 'Unknown action: ' . $action]);
    }
} else {
    json_out(['error' => 'Unsupported method.']);
}

/* ---------------- handlers ---------------- */

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

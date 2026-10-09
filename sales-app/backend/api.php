<?php
/**
 * DTA Sales API. One endpoint: POST JSON {action, token?, ...payload}.
 * Employees only ever see their own leads/activity; the admin sees all.
 */
require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const SESSION_HOURS = 12;
const ONLINE_SECONDS = 120; // no heartbeat for this long = offline (the app pings every 45 s)

class ApiError extends Exception {}

function fail(string $msg, int $code = 400): void { throw new ApiError($msg, $code); }
function out(array $data): void { echo json_encode($data); exit; }
function now(): string { return date('Y-m-d H:i:s'); }
function iso(?string $dt): ?string { return $dt ? str_replace(' ', 'T', $dt) . '+05:30' : null; }

function str_field(array $in, string $k, int $max, bool $required = false): ?string
{
    $v = isset($in[$k]) && is_scalar($in[$k]) ? trim((string)$in[$k]) : '';
    if ($v === '') { if ($required) fail("$k is required."); return null; }
    if (mb_strlen($v) > $max) fail("$k is too long (max $max characters).");
    return $v;
}
function money_field(array $in, string $k): ?float
{
    if (!isset($in[$k]) || $in[$k] === '' || $in[$k] === null) return null;
    if (!is_numeric($in[$k]) || $in[$k] < 0 || $in[$k] > 9999999999) fail("$k must be a valid amount.");
    return round((float)$in[$k], 2);
}
// Only https links are accepted anywhere a URL is stored (they open in the user's browser from the app).
function url_field(array $in, string $k): ?string
{
    $v = isset($in[$k]) && is_scalar($in[$k]) ? trim((string)$in[$k]) : '';
    if ($v === '') return null;
    if (strlen($v) > 1000) fail("$k is too long.");
    $p = parse_url($v);
    $bad = preg_match('/[^\x21-\x7e]/', $v) === 1          // spaces, control or non-ASCII characters (links must be percent-encoded)
        || strpbrk($v, "<>\"'\\") !== false;                // characters that could break out of an attribute
    if ($bad || !$p || strtolower($p['scheme'] ?? '') !== 'https' || empty($p['host'])) fail("$k must be a valid https:// link.");
    return $v;
}
function date_field(array $in, string $k): ?string
{
    $v = isset($in[$k]) ? trim((string)$in[$k]) : '';
    if ($v === '') return null;
    $d = DateTime::createFromFormat('Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) fail("$k must be a date (YYYY-MM-DD).");
    return $v;
}

// ---------- auth ----------
// Accounts are created ONLY by the admin (who sets the username + password and hands them over).
// There is no self-registration and no self-service password change for employees.
// Status: 'active' can log in; 'locked' is blocked by the admin until unlocked; 'removed' is gone for good.

function current_user(PDO $pdo, array $in): array
{
    $token = $in['token'] ?? '';
    if (!is_string($token) || $token === '') fail('Not logged in.', 401);
    $st = $pdo->prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                         WHERE s.token_hash = ? AND s.expires_at > ?");
    $st->execute([hash('sha256', $token), now()]);
    $u = $st->fetch();
    if (!$u) fail('Session expired. Please log in again.', 401);
    if ($u['status'] === 'locked') fail('Your access has been locked by the admin.', 401);
    if ($u['status'] !== 'active') fail('Your access has been removed.', 401);
    // "last active" is refreshed at most once a minute
    if (!$u['last_active_at'] || strtotime($u['last_active_at']) < time() - 15) {
        // any live request also clears a logout mark left by another device's logout
        $pdo->prepare("UPDATE users SET last_active_at = ?, last_logout_at = NULL WHERE id = ?")->execute([now(), $u['id']]);
    }
    return $u;
}
function require_admin(array $u): void { if ($u['role'] !== 'admin') fail('Admin only.', 403); }

function public_user(array $u): array
{
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'fullName' => $u['full_name'],
            'role' => $u['role'], 'state' => $u['state']];
}

function start_session(PDO $pdo, array $u): array
{
    $token = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)")
        ->execute([hash('sha256', $token), $u['id'], now(), date('Y-m-d H:i:s', time() + SESSION_HOURS * 3600)]);
    $pdo->prepare("UPDATE users SET last_login_at = ?, last_active_at = ?, last_logout_at = NULL, failed_attempts = 0, locked_until = NULL WHERE id = ?")
        ->execute([now(), now(), $u['id']]);
    $pdo->prepare("DELETE FROM sessions WHERE expires_at < ?")->execute([now()]);
    return ['token' => $token, 'user' => public_user($u)];
}

function check_lock(array $u): void
{
    if ($u['locked_until'] && strtotime($u['locked_until']) > time()) {
        fail('Too many wrong attempts. Try again in a few minutes.', 429);
    }
}
function register_failure(PDO $pdo, array $u): void
{
    $n = (int)$u['failed_attempts'] + 1;
    $lock = $n >= MAX_FAILED ? date('Y-m-d H:i:s', time() + LOCK_MINUTES * 60) : null;
    $pdo->prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?")
        ->execute([$lock ? 0 : $n, $lock, $u['id']]);
}

function valid_password(string $pw): void
{
    if (strlen($pw) < 8) fail('Password must be at least 8 characters.');
    if (strlen($pw) > 64) fail('Password must be at most 64 characters.');
}
function valid_username(string $name): string
{
    $name = strtolower(trim($name));
    if (!preg_match('/^[a-z0-9._-]{3,32}$/', $name)) fail('Username must be 3-32 characters: letters, numbers, dot, dash, underscore.');
    return $name;
}

function a_setupStatus(PDO $pdo, array $in): void
{
    $n = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
    out(['adminExists' => $n > 0]);
}

function a_register(PDO $pdo, array $in): void
{
    $cfg = get_config();
    $key = (string)($cfg['admin_key'] ?? '');
    if (strlen($key) < 16 || $key === 'change-me-to-a-long-random-string') fail('Set a long admin_key (16+ characters) in config.php first.', 500);
    if (!hash_equals($key, (string)($in['adminKey'] ?? ''))) fail('Wrong admin key.', 403);
    $name = str_field($in, 'fullName', 255, true);
    $username = valid_username((string)($in['username'] ?? ''));
    $pw = (string)($in['password'] ?? '');
    valid_password($pw);
    $st = $pdo->prepare("INSERT INTO users (username, full_name, role, status, password_hash, created_at)
                         SELECT ?, ?, 'admin', 'active', ?, ? FROM DUAL
                         WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')");
    $st->execute([$username, $name, password_hash($pw, PASSWORD_DEFAULT), now()]);
    if ($st->rowCount() === 0) fail('An admin account already exists.', 403);
    $u = $pdo->query("SELECT * FROM users WHERE role = 'admin' LIMIT 1")->fetch();
    out(start_session($pdo, $u));
}

function a_login(PDO $pdo, array $in): void
{
    $st = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $st->execute([strtolower(trim((string)($in['username'] ?? '')))]);
    $u = $st->fetch();
    $bad = 'Invalid username or password.';
    if (!$u || $u['status'] === 'removed' || !$u['password_hash']) fail($bad, 401);
    check_lock($u);
    if (!password_verify((string)($in['password'] ?? ''), $u['password_hash'])) { register_failure($pdo, $u); fail($bad, 401); }
    // Only someone who knows the right password learns the account is locked.
    if ($u['status'] === 'locked') fail('Your access has been locked by the admin. Please contact them.', 403);
    out(start_session($pdo, $u));
}

function a_me(PDO $pdo, array $in): void { out(['user' => public_user(current_user($pdo, $in))]); }

function a_logout(PDO $pdo, array $in): void
{
    $hash = hash('sha256', (string)($in['token'] ?? ''));
    // Logging out marks the person offline right away instead of waiting for the heartbeat to time out.
    $pdo->prepare("UPDATE users SET last_logout_at = ? WHERE id = (SELECT user_id FROM sessions WHERE token_hash = ?)")->execute([now(), $hash]);
    $pdo->prepare("DELETE FROM sessions WHERE token_hash = ?")->execute([$hash]);
    out(['ok' => true]);
}

// Heartbeat: the open app calls this every ~45 s. current_user() records the activity time.
function a_ping(PDO $pdo, array $in): void { current_user($pdo, $in); out(['ok' => true]); }

// Online = active account, heard from within ONLINE_SECONDS, and not logged out (login / any live request clears the mark).
function is_online(array $r): bool
{
    if (($r['status'] ?? '') !== 'active' || empty($r['last_active_at']) || !empty($r['last_logout_at'])) return false;
    return strtotime($r['last_active_at']) >= time() - ONLINE_SECONDS;
}

// ---------- team (admin only) ----------

function check_state(?string $s, bool $required): ?string
{
    if ($s === null) { if ($required) fail('state is required.'); return null; }
    if (!in_array($s, STATES, true)) fail('Unknown state.');
    return $s;
}

function load_employee(PDO $pdo, int $id): array
{
    $st = $pdo->prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'");
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u) fail('Employee not found.', 404);
    return $u;
}

function a_createEmployee(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $name = str_field($in, 'fullName', 255, true);
    $username = valid_username((string)($in['username'] ?? ''));
    $pw = (string)($in['password'] ?? '');
    valid_password($pw);
    $state = check_state(str_field($in, 'state', 64), true);
    try {
        $pdo->prepare("INSERT INTO users (username, full_name, role, state, status, password_hash, created_at)
                       VALUES (?,?,'employee',?,'active',?,?)")
            ->execute([$username, $name, $state, password_hash($pw, PASSWORD_DEFAULT), now()]);
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? 0) === 1062) fail('That username is already taken.');
        throw $e;
    }
    out(['username' => $username]);
}

function a_setEmployeePassword(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $u = load_employee($pdo, (int)($in['userId'] ?? 0));
    if ($u['status'] === 'removed') fail('This employee was removed.');
    $pw = (string)($in['password'] ?? '');
    valid_password($pw);
    $pdo->prepare("UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?")
        ->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    $pdo->prepare("DELETE FROM sessions WHERE user_id = ?")->execute([$u['id']]); // old password's sessions end
    out(['ok' => true]);
}

function a_updateEmployee(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $u = load_employee($pdo, (int)($in['userId'] ?? 0));
    $name = str_field($in, 'fullName', 255, true);
    $state = check_state(str_field($in, 'state', 64), true);
    $pdo->prepare("UPDATE users SET full_name = ?, state = ? WHERE id = ?")->execute([$name, $state, $u['id']]);
    out(['ok' => true]);
}

// Lock = block login and every request right away; unlock restores access (after a fresh login). Data is untouched.
function a_lockEmployee(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $u = load_employee($pdo, (int)($in['userId'] ?? 0));
    if ($u['status'] === 'removed') fail('This employee was removed.');
    // Sessions are kept on purpose: current_user() refuses every request from a locked account, and tells them why.
    $pdo->prepare("UPDATE users SET status = 'locked', locked_at = ? WHERE id = ?")->execute([now(), $u['id']]);
    out(['ok' => true]);
}

function a_unlockEmployee(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $u = load_employee($pdo, (int)($in['userId'] ?? 0));
    if ($u['status'] === 'removed') fail('This employee was removed.');
    $pdo->prepare("UPDATE users SET status = 'active', locked_at = NULL, failed_attempts = 0, locked_until = NULL WHERE id = ?")->execute([$u['id']]);
    $pdo->prepare("DELETE FROM sessions WHERE user_id = ?")->execute([$u['id']]); // must log in fresh after being unlocked
    out(['ok' => true]);
}

function a_removeEmployee(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $u = load_employee($pdo, (int)($in['userId'] ?? 0));
    $pdo->prepare("UPDATE users SET status = 'removed', password_hash = NULL WHERE id = ?")->execute([$u['id']]);
    $pdo->prepare("DELETE FROM sessions WHERE user_id = ?")->execute([$u['id']]); // kicks them out immediately
    out(['ok' => true]);
}

function a_listTeam(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $rows = $pdo->query("SELECT id, username, full_name, state, status, created_at, locked_at, last_login_at, last_active_at, last_logout_at
                         FROM users WHERE role = 'employee' ORDER BY FIELD(status, 'active', 'locked', 'removed'), full_name")->fetchAll();
    out(['team' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'username' => $r['username'], 'fullName' => $r['full_name'], 'state' => $r['state'], 'status' => $r['status'],
        'online' => is_online($r), 'createdAt' => iso($r['created_at']), 'lockedAt' => iso($r['locked_at']), 'lastLoginAt' => iso($r['last_login_at']), 'lastActiveAt' => iso($r['last_active_at']),
    ], $rows)]);
}

// ---------- leads ----------

function lead_row(array $r): array
{
    return [
        'id' => (int)$r['id'], 'userId' => (int)$r['user_id'], 'employee' => $r['employee_name'] ?? null,
        'name' => $r['name'], 'contactPerson' => $r['contact_person'], 'phone' => $r['phone'], 'email' => $r['email'],
        'state' => $r['state'], 'city' => $r['city'], 'productType' => $r['product_type'], 'productName' => $r['product_name'],
        'stage' => $r['stage'], 'estValue' => (float)$r['est_value'],
        'dealValue' => $r['deal_value'] === null ? null : (float)$r['deal_value'],
        'nextFollowup' => $r['next_followup'], 'notes' => $r['notes'],
        'createdAt' => iso($r['created_at']), 'updatedAt' => iso($r['updated_at']), 'wonAt' => iso($r['won_at']),
    ];
}

function log_activity(PDO $pdo, int $userId, ?int $leadId, ?string $leadName, string $type, ?string $note): void
{
    $pdo->prepare("INSERT INTO activities (user_id, lead_id, lead_name, type, note, created_at) VALUES (?,?,?,?,?,?)")
        ->execute([$userId, $leadId, $leadName, $type, $note, now()]);
}

function lead_fields(array $in): array
{
    $product = str_field($in, 'productType', 16, true);
    if (!in_array($product, PRODUCT_TYPES, true)) fail('productType must be software, app or website.');
    $email = str_field($in, 'email', 255);
    if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Email looks invalid.');
    $phone = str_field($in, 'phone', 32);
    if ($phone !== null && !preg_match('/^[0-9+\-() ]{6,32}$/', $phone)) fail('Phone looks invalid.');
    return [
        'name' => str_field($in, 'name', 255, true),
        'contact_person' => str_field($in, 'contactPerson', 255),
        'phone' => $phone, 'email' => $email,
        'state' => check_state(str_field($in, 'state', 64), true),
        'city' => str_field($in, 'city', 128),
        'product_type' => $product,
        'product_name' => str_field($in, 'productName', 255),
        'est_value' => money_field($in, 'estValue') ?? 0,
        'next_followup' => date_field($in, 'nextFollowup'),
        'notes' => str_field($in, 'notes', 5000),
    ];
}

function a_addLead(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    if ($u['role'] !== 'employee') fail('Only sales employees add leads.', 403);
    $f = lead_fields($in);
    $pdo->prepare("INSERT INTO leads (user_id, name, contact_person, phone, email, state, city, product_type, product_name,
                                      stage, est_value, next_followup, notes, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?)")
        ->execute([$u['id'], $f['name'], $f['contact_person'], $f['phone'], $f['email'], $f['state'], $f['city'],
                   $f['product_type'], $f['product_name'], $f['est_value'], $f['next_followup'], $f['notes'], now(), now()]);
    $id = (int)$pdo->lastInsertId();
    log_activity($pdo, (int)$u['id'], $id, $f['name'], 'lead_added', "New {$f['product_type']} lead in {$f['state']}");
    out(['id' => $id]);
}

function load_lead(PDO $pdo, array $u, int $id): array
{
    $st = $pdo->prepare("SELECT * FROM leads WHERE id = ?");
    $st->execute([$id]);
    $l = $st->fetch();
    if (!$l || ($u['role'] !== 'admin' && (int)$l['user_id'] !== (int)$u['id'])) fail('Lead not found.', 404);
    return $l;
}

function a_updateLead(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    if ($u['role'] !== 'employee') fail('Only the owning employee edits a lead.', 403);
    $old = load_lead($pdo, $u, (int)($in['id'] ?? 0));
    $f = lead_fields($in);
    $stage = str_field($in, 'stage', 16) ?? $old['stage'];
    if (!in_array($stage, STAGES, true)) fail('Unknown stage.');

    $deal = $old['deal_value']; $wonAt = $old['won_at'];
    if ($stage === 'won') {
        $deal = money_field($in, 'dealValue');
        if ($deal === null) $deal = $old['deal_value'] !== null ? (float)$old['deal_value'] : $f['est_value'];
        if ($old['stage'] !== 'won') $wonAt = now();
    } else { $deal = null; $wonAt = null; }

    $pdo->prepare("UPDATE leads SET name=?, contact_person=?, phone=?, email=?, state=?, city=?, product_type=?, product_name=?,
                   stage=?, est_value=?, deal_value=?, next_followup=?, notes=?, updated_at=?, won_at=? WHERE id=?")
        ->execute([$f['name'], $f['contact_person'], $f['phone'], $f['email'], $f['state'], $f['city'], $f['product_type'],
                   $f['product_name'], $stage, $f['est_value'], $deal, $f['next_followup'], $f['notes'], now(), $wonAt, $old['id']]);

    if ($stage !== $old['stage']) {
        log_activity($pdo, (int)$u['id'], (int)$old['id'], $f['name'], 'stage_change', "{$old['stage']} → $stage");
        if ($stage === 'won') log_activity($pdo, (int)$u['id'], (int)$old['id'], $f['name'], 'client_won', 'Deal value ₹' . number_format((float)$deal, 2));
    }
    out(['ok' => true]);
}

function a_deleteLead(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    $l = load_lead($pdo, $u, (int)($in['id'] ?? 0));
    if ($u['role'] !== 'admin' && $l['stage'] === 'won') fail('A won deal can only be removed by the admin.', 403);
    $pdo->prepare("DELETE FROM leads WHERE id = ?")->execute([$l['id']]);
    log_activity($pdo, (int)$u['id'], null, $l['name'], 'note', 'Deleted lead' . ($u['role'] === 'admin' ? ' (by admin)' : ''));
    out(['ok' => true]);
}

function a_listLeads(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    $where = []; $p = [];
    if ($u['role'] !== 'admin') { $where[] = 'l.user_id = ?'; $p[] = $u['id']; }
    elseif (!empty($in['userId'])) { $where[] = 'l.user_id = ?'; $p[] = (int)$in['userId']; }
    foreach (['stage' => STAGES, 'productType' => PRODUCT_TYPES, 'state' => STATES] as $k => $allowed) {
        if (!empty($in[$k])) {
            if (!in_array($in[$k], $allowed, true)) fail("Bad $k filter.");
            $where[] = 'l.' . ($k === 'productType' ? 'product_type' : $k) . ' = ?'; $p[] = $in[$k];
        }
    }
    if (!empty($in['q'])) {
        $like = '%' . str_replace(['%', '_'], ['\%', '\_'], trim((string)$in['q'])) . '%';
        $where[] = '(l.name LIKE ? OR l.contact_person LIKE ? OR l.phone LIKE ? OR l.city LIKE ?)';
        array_push($p, $like, $like, $like, $like);
    }
    if (!empty($in['dueOnly'])) { $where[] = "l.next_followup IS NOT NULL AND l.next_followup <= CURDATE() AND l.stage NOT IN ('won','lost')"; }
    $w = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $limit = min(max((int)($in['limit'] ?? 200), 1), 500);
    $offset = max((int)($in['offset'] ?? 0), 0);
    $c = $pdo->prepare("SELECT COUNT(*) FROM leads l $w"); $c->execute($p);
    $total = (int)$c->fetchColumn();
    $st = $pdo->prepare("SELECT l.*, u.full_name AS employee_name FROM leads l JOIN users u ON u.id = l.user_id
                         $w ORDER BY l.updated_at DESC, l.id DESC LIMIT $limit OFFSET $offset");
    $st->execute($p);
    out(['total' => $total, 'leads' => array_map('lead_row', $st->fetchAll())]);
}

// ---------- activity ----------

function a_addActivity(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    if ($u['role'] !== 'employee') fail('Only sales employees log activity.', 403);
    $type = str_field($in, 'type', 16, true);
    if (!in_array($type, ACTIVITY_TYPES, true)) fail('Unknown activity type.');
    $note = str_field($in, 'note', 2000);
    $leadId = null; $leadName = null;
    if (!empty($in['leadId'])) { $l = load_lead($pdo, $u, (int)$in['leadId']); $leadId = (int)$l['id']; $leadName = $l['name']; }
    if ($note === null && $leadId === null) fail('Add a note or pick a lead.');
    log_activity($pdo, (int)$u['id'], $leadId, $leadName, $type, $note);
    if ($leadId) $pdo->prepare("UPDATE leads SET updated_at = ? WHERE id = ?")->execute([now(), $leadId]);
    out(['ok' => true]);
}

function a_listActivities(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    $where = []; $p = [];
    if ($u['role'] !== 'admin') { $where[] = 'a.user_id = ?'; $p[] = $u['id']; }
    elseif (!empty($in['userId'])) { $where[] = 'a.user_id = ?'; $p[] = (int)$in['userId']; }
    if (!empty($in['leadId'])) { $where[] = 'a.lead_id = ?'; $p[] = (int)$in['leadId']; }
    if (!empty($in['type'])) { $where[] = 'a.type = ?'; $p[] = (string)$in['type']; }
    if ($f = date_field($in, 'from')) { $where[] = 'a.created_at >= ?'; $p[] = "$f 00:00:00"; }
    if ($t = date_field($in, 'to')) { $where[] = 'a.created_at <= ?'; $p[] = "$t 23:59:59"; }
    if (!empty($in['beforeId'])) { $where[] = 'a.id < ?'; $p[] = (int)$in['beforeId']; }
    $w = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $limit = min(max((int)($in['limit'] ?? 50), 1), 200);
    $st = $pdo->prepare("SELECT a.*, u.full_name AS employee_name, u.state AS employee_state FROM activities a
                         JOIN users u ON u.id = a.user_id $w ORDER BY a.id DESC LIMIT " . ($limit + 1));
    $st->execute($p);
    $rows = $st->fetchAll();
    $more = count($rows) > $limit;
    $rows = array_slice($rows, 0, $limit);
    out(['hasMore' => $more, 'activities' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'userId' => (int)$r['user_id'], 'employee' => $r['employee_name'], 'state' => $r['employee_state'],
        'leadId' => $r['lead_id'] === null ? null : (int)$r['lead_id'], 'leadName' => $r['lead_name'],
        'type' => $r['type'], 'note' => $r['note'], 'createdAt' => iso($r['created_at']),
    ], $rows)]);
}

// ---------- demo requests ----------

function demo_row(array $r): array
{
    return [
        'id' => (int)$r['id'], 'userId' => (int)$r['user_id'], 'employee' => $r['employee_name'] ?? null, 'employeeState' => $r['employee_state'] ?? null,
        'leadId' => $r['lead_id'] === null ? null : (int)$r['lead_id'],
        'clientName' => $r['client_name'], 'contactPerson' => $r['contact_person'], 'phone' => $r['phone'],
        'state' => $r['state'], 'city' => $r['city'], 'productType' => $r['product_type'], 'productName' => $r['product_name'],
        'mode' => $r['mode'], 'preferredDate' => $r['preferred_date'], 'preferredTime' => $r['preferred_time'], 'notes' => $r['notes'],
        'status' => $r['status'], 'scheduledAt' => $r['scheduled_at'] ? str_replace(' ', 'T', $r['scheduled_at']) : null, // IST wall-clock, no zone
        'meetingUrl' => $r['meeting_url'],
        'adminNote' => $r['admin_note'], 'createdAt' => iso($r['created_at']), 'updatedAt' => iso($r['updated_at']),
    ];
}

function notify_admin_by_email(string $subject, string $body): void
{
    $to = (string)(get_config()['notify_email'] ?? '');
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;
    $clean = fn(string $s) => str_replace(["\r", "\n"], ' ', $s); // no header injection
    @mail($to, $clean($subject), $body, 'Content-Type: text/plain; charset=UTF-8');
}

function a_addDemoRequest(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    if ($u['role'] !== 'employee') fail('Only sales employees request demos.', 403);
    $lead = null;
    if (!empty($in['leadId'])) $lead = load_lead($pdo, $u, (int)$in['leadId']);
    $name = str_field($in, 'clientName', 255) ?? ($lead['name'] ?? null);
    if ($name === null) fail('clientName is required.');
    $product = str_field($in, 'productType', 16) ?? ($lead['product_type'] ?? null);
    if (!in_array($product, PRODUCT_TYPES, true)) fail('productType must be software, app or website.');
    $mode = str_field($in, 'mode', 16) ?? 'online';
    if (!in_array($mode, DEMO_MODES, true)) fail('mode must be online or onsite.');
    $state = check_state(str_field($in, 'state', 64) ?? ($lead['state'] ?? null), true);
    $phone = str_field($in, 'phone', 32) ?? ($lead['phone'] ?? null);
    if ($phone !== null && !preg_match('/^[0-9+\-() ]{6,32}$/', $phone)) fail('Phone looks invalid.');
    $date = date_field($in, 'preferredDate');
    if ($date !== null && $date < date('Y-m-d')) fail('Preferred date cannot be in the past.');
    $contact = str_field($in, 'contactPerson', 255) ?? ($lead['contact_person'] ?? null);
    $city = str_field($in, 'city', 128) ?? ($lead['city'] ?? null);
    $pname = str_field($in, 'productName', 255) ?? ($lead['product_name'] ?? null);
    $time = str_field($in, 'preferredTime', 32);
    $notes = str_field($in, 'notes', 3000);

    $pdo->prepare("INSERT INTO demo_requests (user_id, lead_id, client_name, contact_person, phone, state, city, product_type, product_name,
                   mode, preferred_date, preferred_time, notes, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)")
        ->execute([$u['id'], $lead['id'] ?? null, $name, $contact, $phone, $state, $city, $product, $pname, $mode, $date, $time, $notes, now(), now()]);
    $id = (int)$pdo->lastInsertId();
    log_activity($pdo, (int)$u['id'], $lead ? (int)$lead['id'] : null, $name, 'demo_requested', "Requested a demo ($mode, $product)" . ($date ? " for $date" : ''));
    notify_admin_by_email("New demo request from {$u['full_name']} ({$u['state']})",
        "{$u['full_name']} asked for a $mode $product demo.\n\nClient: $name\nState: $state" . ($city ? ", $city" : '') . ($phone ? "\nPhone: $phone" : '') .
        ($date ? "\nPreferred: $date" . ($time ? " ($time)" : '') : '') . ($notes ? "\n\nNotes: $notes" : '') . "\n\nOpen DTA Sales -> Demo requests to schedule it.");
    out(['id' => $id]);
}

function a_listDemoRequests(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    $where = []; $p = [];
    if ($u['role'] !== 'admin') { $where[] = 'd.user_id = ?'; $p[] = $u['id']; }
    elseif (!empty($in['userId'])) { $where[] = 'd.user_id = ?'; $p[] = (int)$in['userId']; }
    if (!empty($in['status'])) {
        if (!in_array($in['status'], DEMO_STATUSES, true)) fail('Bad status filter.');
        $where[] = 'd.status = ?'; $p[] = $in['status'];
    }
    $w = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $st = $pdo->prepare("SELECT d.*, u.full_name AS employee_name, u.state AS employee_state FROM demo_requests d JOIN users u ON u.id = d.user_id
                         $w ORDER BY (d.status = 'pending') DESC, d.created_at DESC LIMIT 300");
    $st->execute($p);
    // pending count in the viewer's own scope, ignoring filters -- drives the badge in the sidebar
    $pc = $pdo->prepare("SELECT COUNT(*) FROM demo_requests WHERE status = 'pending'" . ($u['role'] === 'admin' ? '' : ' AND user_id = ?'));
    $pc->execute($u['role'] === 'admin' ? [] : [$u['id']]);
    $sc = $pdo->prepare("SELECT COUNT(*) FROM demo_requests WHERE status = 'scheduled'" . ($u['role'] === 'admin' ? '' : ' AND user_id = ?'));
    $sc->execute($u['role'] === 'admin' ? [] : [$u['id']]);
    out(['pending' => (int)$pc->fetchColumn(), 'scheduled' => (int)$sc->fetchColumn(), 'requests' => array_map('demo_row', $st->fetchAll())]);
}

function a_updateDemoRequest(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $st = $pdo->prepare("SELECT * FROM demo_requests WHERE id = ?");
    $st->execute([(int)($in['id'] ?? 0)]);
    $d = $st->fetch();
    if (!$d) fail('Demo request not found.', 404);
    if ($d['status'] === 'cancelled') fail('The employee cancelled this request.');
    $status = str_field($in, 'status', 16, true);
    if (!in_array($status, ['pending', 'scheduled', 'completed', 'declined'], true)) fail('Bad status.');
    $sched = null;
    if ($status === 'scheduled' || $status === 'completed') {
        $raw = str_field($in, 'scheduledAt', 32);
        if ($raw !== null) {
            $dt = DateTime::createFromFormat('Y-m-d\TH:i', $raw) ?: DateTime::createFromFormat('Y-m-d\TH:i:s', $raw);
            if (!$dt) fail('scheduledAt must look like 2026-10-20T15:30.');
            $sched = $dt->format('Y-m-d H:i:s');
        } else $sched = $d['scheduled_at'];
        if ($status === 'scheduled' && $sched === null) fail('Pick the date and time of the demo.');
    }
    $url = ($status === 'declined') ? null : url_field($in, 'meetingUrl');
    $pdo->prepare("UPDATE demo_requests SET status = ?, scheduled_at = ?, meeting_url = ?, admin_note = ?, updated_at = ? WHERE id = ?")
        ->execute([$status, $sched, $url, str_field($in, 'adminNote', 3000), now(), $d['id']]);
    if ($status !== $d['status'] || $url !== $d['meeting_url']) {
        $when = $sched ? ' on ' . date('d M Y, g:i A', strtotime($sched)) : '';
        log_activity($pdo, (int)$d['user_id'], $d['lead_id'] === null ? null : (int)$d['lead_id'], $d['client_name'], 'demo_update', "Demo $status$when" . ($url ? ' — link shared' : ''));
    }
    out(['ok' => true]);
}

function a_cancelDemoRequest(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    $st = $pdo->prepare("SELECT * FROM demo_requests WHERE id = ? AND user_id = ?");
    $st->execute([(int)($in['id'] ?? 0), $u['id']]);
    $d = $st->fetch();
    if (!$d) fail('Demo request not found.', 404);
    if ($d['status'] !== 'pending') fail('Only a pending request can be cancelled -- ask the DTA team.');
    $pdo->prepare("UPDATE demo_requests SET status = 'cancelled', updated_at = ? WHERE id = ?")->execute([now(), $d['id']]);
    out(['ok' => true]);
}

// ---------- monthly business (won clients per month / year) ----------

function a_monthlyWon(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    $fy = !empty($in['fy']); // financial year: April -> March
    $scope = ''; $sp = [];
    if ($u['role'] !== 'admin') { $scope = ' AND l.user_id = ?'; $sp[] = $u['id']; }
    elseif (!empty($in['userId'])) { $scope = ' AND l.user_id = ?'; $sp[] = (int)$in['userId']; }

    $cy = (int)date('Y'); $cm = (int)date('n');
    $curStart = $fy && $cm < 4 ? $cy - 1 : $cy;           // the current year / financial-year start
    $year = (int)($in['year'] ?? $curStart);
    if ($year < 2000 || $year > 2100) fail('Bad year.');
    $start = sprintf($fy ? '%04d-04-01 00:00:00' : '%04d-01-01 00:00:00', $year);
    $end = sprintf($fy ? '%04d-04-01 00:00:00' : '%04d-01-01 00:00:00', $year + 1);

    $st = $pdo->prepare("SELECT l.id, l.user_id, l.name, l.state, l.city, l.product_type, l.product_name, l.deal_value, l.won_at, u.full_name AS employee_name
                         FROM leads l JOIN users u ON u.id = l.user_id
                         WHERE l.stage = 'won' AND l.won_at >= ? AND l.won_at < ? $scope ORDER BY l.won_at DESC, l.id DESC LIMIT 5000");
    $st->execute(array_merge([$start, $end], $sp));
    $rows = $st->fetchAll();

    $months = [];
    for ($i = 0; $i < 12; $i++) {
        $m = ($fy ? 3 + $i : $i) % 12 + 1;                     // Apr..Mar or Jan..Dec
        $y = $fy && $m < 4 ? $year + 1 : $year;
        $months["$y-$m"] = ['year' => $y, 'month' => $m, 'clients' => 0, 'revenue' => 0.0, 'byProduct' => array_fill_keys(PRODUCT_TYPES, 0.0)];
    }
    $byEmp = []; $clients = [];
    foreach ($rows as $r) {
        $t = strtotime($r['won_at']); $key = date('Y', $t) . '-' . (int)date('n', $t);
        $v = (float)$r['deal_value'];
        if (isset($months[$key])) { $months[$key]['clients']++; $months[$key]['revenue'] += $v; $months[$key]['byProduct'][$r['product_type']] += $v; }
        $byEmp[$r['user_id']] ??= ['userId' => (int)$r['user_id'], 'employee' => $r['employee_name'], 'clients' => 0, 'revenue' => 0.0];
        $byEmp[$r['user_id']]['clients']++; $byEmp[$r['user_id']]['revenue'] += $v;
        $clients[] = ['id' => (int)$r['id'], 'userId' => (int)$r['user_id'], 'employee' => $r['employee_name'], 'name' => $r['name'], 'state' => $r['state'], 'city' => $r['city'],
                      'productType' => $r['product_type'], 'productName' => $r['product_name'], 'dealValue' => $v, 'wonAt' => iso($r['won_at'])];
    }
    $mm = $pdo->prepare("SELECT MIN(won_at), MAX(won_at) FROM leads l WHERE l.stage = 'won' AND l.won_at IS NOT NULL $scope");
    $mm->execute($sp);
    [$minWon, $maxWon] = $mm->fetch(PDO::FETCH_NUM);
    $toStart = fn(string $d) => (int)date('Y', strtotime($d)) - ($fy && (int)date('n', strtotime($d)) < 4 ? 1 : 0);
    $first = min($minWon ? $toStart($minWon) : $curStart, $year);
    $last = max($maxWon ? $toStart($maxWon) : $curStart, $curStart, $year);
    $totClients = count($clients); $totRev = array_sum(array_column($clients, 'dealValue'));
    out(['fy' => $fy, 'year' => $year, 'years' => range($first, $last),
         'months' => array_values($months), 'totals' => ['clients' => $totClients, 'revenue' => (float)$totRev],
         'byEmployee' => $u['role'] === 'admin' ? array_values($byEmp) : [], 'clients' => $clients]);
}

// ---------- official links (website, offices, Instagram) ----------
// Shown to every employee so they can share DTA's official details with customers; only the admin edits them.

const OFFICIAL_KEYS = ['website', 'mapTezpur', 'mapBangalore', 'instagram'];
const OFFICIAL_DEFAULTS = ['website' => 'https://dtaonline.in', 'mapTezpur' => 'https://www.google.com/maps/place/DTA/@26.6209962,92.7955764,674m/data=!3m2!1e3!4b1!4m6!3m5!1s0x3744e9a2e06b93ed:0xf3ca2155af2699b0!8m2!3d26.6209962!4d92.7981513!16s%2Fg%2F11njz4v61p?entry=ttu&g_ep=EgoyMDI2MTAwNi4wIKXMDSoASAFQAw%3D%3D', 'mapBangalore' => 'https://www.google.com/maps/place/DTA/@13.0321014,77.5552546,735m/data=!3m2!1e3!4b1!4m6!3m5!1s0x3bae3d12ddf2f6e9:0x34dc1a3db5883f7d!8m2!3d13.0321014!4d77.5578295!16s%2Fg%2F11nw2zd5h_?entry=ttu&g_ep=EgoyMDI2MTAwNi4wIKXMDSoASAFQAw%3D%3D', 'instagram' => 'https://www.instagram.com/dtaofficialtezpur/'];

function load_official_links(PDO $pdo): array
{
    $st = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'official_links'");
    $st->execute();
    $saved = json_decode((string)$st->fetchColumn(), true);
    $out = OFFICIAL_DEFAULTS;
    if (is_array($saved)) foreach (OFFICIAL_KEYS as $k) if (isset($saved[$k]) && is_string($saved[$k])) $out[$k] = $saved[$k];
    return $out;
}

function a_getOfficialLinks(PDO $pdo, array $in): void
{
    current_user($pdo, $in);
    out(['links' => load_official_links($pdo)]);
}

function a_setOfficialLinks(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $links = [];
    foreach (OFFICIAL_KEYS as $k) $links[$k] = url_field($in, $k) ?? '';
    $pdo->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('official_links', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")
        ->execute([json_encode($links)]);
    out(['links' => $links]);
}

// ---------- stats ----------

function a_stats(PDO $pdo, array $in): void
{
    $u = current_user($pdo, $in);
    $from = date_field($in, 'from'); $to = date_field($in, 'to');
    $fromDt = $from ? "$from 00:00:00" : '1970-01-01 00:00:00';
    $toDt = $to ? "$to 23:59:59" : '2999-12-31 23:59:59';

    $userSql = "role = 'employee'"; $up = [];
    if ($u['role'] !== 'admin') { $userSql .= ' AND id = ?'; $up[] = $u['id']; }
    $st = $pdo->prepare("SELECT id, full_name, username, state, status, last_login_at, last_active_at, last_logout_at FROM users WHERE $userSql ORDER BY full_name");
    $st->execute($up);
    $emps = [];
    foreach ($st->fetchAll() as $r) {
        $emps[(int)$r['id']] = ['id' => (int)$r['id'], 'fullName' => $r['full_name'], 'username' => $r['username'],
            'state' => $r['state'], 'status' => $r['status'], 'online' => is_online($r), 'lastLoginAt' => iso($r['last_login_at']), 'lastActiveAt' => iso($r['last_active_at']),
            'leads' => 0, 'clients' => 0, 'revenue' => 0.0, 'activities' => 0];
    }
    $scope = $u['role'] === 'admin' ? '' : ' AND user_id = ' . (int)$u['id'];

    $q = $pdo->prepare("SELECT user_id, COUNT(*) n FROM leads WHERE created_at BETWEEN ? AND ? $scope GROUP BY user_id");
    $q->execute([$fromDt, $toDt]);
    foreach ($q->fetchAll() as $r) if (isset($emps[$r['user_id']])) $emps[$r['user_id']]['leads'] = (int)$r['n'];

    $q = $pdo->prepare("SELECT user_id, COUNT(*) n, COALESCE(SUM(deal_value),0) rev FROM leads
                        WHERE stage = 'won' AND won_at BETWEEN ? AND ? $scope GROUP BY user_id");
    $q->execute([$fromDt, $toDt]);
    foreach ($q->fetchAll() as $r) if (isset($emps[$r['user_id']])) { $emps[$r['user_id']]['clients'] = (int)$r['n']; $emps[$r['user_id']]['revenue'] = (float)$r['rev']; }

    $q = $pdo->prepare("SELECT user_id, COUNT(*) n FROM activities
                        WHERE type IN ('call','visit','meeting','follow_up','note') AND created_at BETWEEN ? AND ? $scope GROUP BY user_id");
    $q->execute([$fromDt, $toDt]);
    foreach ($q->fetchAll() as $r) if (isset($emps[$r['user_id']])) $emps[$r['user_id']]['activities'] = (int)$r['n'];

    // by product: leads created in range, and wins in range
    $byProduct = [];
    foreach (PRODUCT_TYPES as $t) $byProduct[$t] = ['productType' => $t, 'leads' => 0, 'clients' => 0, 'revenue' => 0.0];
    $q = $pdo->prepare("SELECT product_type, COUNT(*) n FROM leads WHERE created_at BETWEEN ? AND ? $scope GROUP BY product_type");
    $q->execute([$fromDt, $toDt]);
    foreach ($q->fetchAll() as $r) if (isset($byProduct[$r['product_type']])) $byProduct[$r['product_type']]['leads'] = (int)$r['n'];
    $q = $pdo->prepare("SELECT product_type, COUNT(*) n, COALESCE(SUM(deal_value),0) rev FROM leads
                        WHERE stage = 'won' AND won_at BETWEEN ? AND ? $scope GROUP BY product_type");
    $q->execute([$fromDt, $toDt]);
    foreach ($q->fetchAll() as $r) if (isset($byProduct[$r['product_type']])) { $byProduct[$r['product_type']]['clients'] = (int)$r['n']; $byProduct[$r['product_type']]['revenue'] = (float)$r['rev']; }

    // current pipeline (all-time, not date filtered): open leads per stage + overdue follow-ups
    $q = $pdo->query("SELECT stage, COUNT(*) n FROM leads WHERE 1=1 $scope GROUP BY stage");
    $pipeline = array_fill_keys(STAGES, 0);
    foreach ($q->fetchAll() as $r) $pipeline[$r['stage']] = (int)$r['n'];
    $due = (int)$pdo->query("SELECT COUNT(*) FROM leads WHERE next_followup IS NOT NULL AND next_followup <= CURDATE()
                             AND stage NOT IN ('won','lost') $scope")->fetchColumn();

    $byState = [];
    foreach ($emps as $e) {
        $s = $e['state'] ?: 'Unassigned';
        $byState[$s] ??= ['state' => $s, 'employees' => 0, 'leads' => 0, 'clients' => 0, 'revenue' => 0.0];
        $byState[$s]['employees']++;
        foreach (['leads', 'clients', 'revenue'] as $k) $byState[$s][$k] += $e[$k];
    }
    $totals = ['leads' => 0, 'clients' => 0, 'revenue' => 0.0, 'activities' => 0, 'employees' => 0];
    foreach ($emps as $e) {
        foreach (['leads', 'clients', 'revenue', 'activities'] as $k) $totals[$k] += $e[$k];
        if ($e['status'] === 'active') $totals['employees']++;
    }
    out(['totals' => $totals, 'employees' => array_values($emps), 'byState' => array_values($byState),
         'byProduct' => array_values($byProduct), 'pipeline' => $pipeline, 'followupsDue' => $due]);
}

// ---------- backup (admin) ----------

function a_exportAll(PDO $pdo, array $in): void
{
    require_admin(current_user($pdo, $in));
    $leads = $pdo->query("SELECT l.*, u.full_name AS employee_name FROM leads l JOIN users u ON u.id = l.user_id ORDER BY l.id")->fetchAll();
    $acts = $pdo->query("SELECT a.*, u.full_name AS employee_name, u.state AS employee_state FROM activities a JOIN users u ON u.id = a.user_id ORDER BY a.id")->fetchAll();
    $team = $pdo->query("SELECT id, username, full_name, state, status, created_at, last_login_at, last_active_at FROM users WHERE role = 'employee' ORDER BY id")->fetchAll();
    $demos = $pdo->query("SELECT d.*, u.full_name AS employee_name, u.state AS employee_state FROM demo_requests d JOIN users u ON u.id = d.user_id ORDER BY d.id")->fetchAll();
    out([
        'exportedAt' => iso(now()),
        'demoRequests' => array_map('demo_row', $demos),
        'leads' => array_map('lead_row', $leads),
        'activities' => array_map(fn($r) => [
            'id' => (int)$r['id'], 'userId' => (int)$r['user_id'], 'employee' => $r['employee_name'], 'state' => $r['employee_state'],
            'leadId' => $r['lead_id'] === null ? null : (int)$r['lead_id'], 'leadName' => $r['lead_name'],
            'type' => $r['type'], 'note' => $r['note'], 'createdAt' => iso($r['created_at']),
        ], $acts),
        'employees' => array_map(fn($r) => [
            'id' => (int)$r['id'], 'username' => $r['username'], 'fullName' => $r['full_name'], 'state' => $r['state'], 'status' => $r['status'],
            'createdAt' => iso($r['created_at']), 'lastLoginAt' => iso($r['last_login_at']), 'lastActiveAt' => iso($r['last_active_at']),
        ], $team),
    ]); // never includes password hashes or sessions
}

// ---------- dispatch ----------

try {
    // Opening api.php in a browser (GET) answers without touching the database -- handy for checking the URL.
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') out(['ok' => true, 'service' => 'dta-sales-api']);
    $raw = file_get_contents('php://input');
    $in = json_decode($raw ?: '', true);
    if (!is_array($in)) fail('Invalid request.');
    $action = (string)($in['action'] ?? '');
    $fn = 'a_' . $action;
    if (!preg_match('/^[A-Za-z]+$/', $action) || !function_exists($fn)) fail('Unknown action.', 404);
    $fn(get_pdo(), $in);
} catch (ApiError $e) {
    http_response_code($e->getCode() ?: 400);
    out(['error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('sales api: ' . $e);
    http_response_code(500);
    out(['error' => 'Server error.']);
}

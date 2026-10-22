<?php
/**
 * Database connection + one-time schema setup.
 * Tables are created automatically on first use — no separate manual
 * import step, though schema.sql is also provided if you'd rather import
 * it by hand.
 */

function get_config(): array
{
    $configPath = __DIR__ . '/config.php';
    if (!file_exists($configPath)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'config.php is missing. Copy config.example.php to config.php and fill in your database details.']);
        exit;
    }
    return require $configPath;
}

function get_pdo(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $config = get_config();
    $dsn = "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4";
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    ensure_schema($pdo);
    ensure_upload_dir();
    return $pdo;
}

define('UPLOAD_DIR', __DIR__ . '/uploads');

/**
 * Creates the uploads/ folder (and locks it down with a .htaccess) the
 * first time it's needed — same "no manual server step" spirit as
 * ensure_schema(). Files inside are named randomly (see handle_upload_file
 * in api.php), and this .htaccess blocks direct web access to them anyway
 * — the only way to fetch one is through api.php's own permission check.
 */
function ensure_upload_dir(): void
{
    if (!is_dir(UPLOAD_DIR)) {
        mkdir(UPLOAD_DIR, 0755, true);
    }
    $htaccess = UPLOAD_DIR . '/.htaccess';
    if (!file_exists($htaccess)) {
        file_put_contents($htaccess, "Require all denied\n");
    }
}

function ensure_schema(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS clients (
            id VARCHAR(32) PRIMARY KEY,
            api_key VARCHAR(64) NOT NULL,
            client_name VARCHAR(255) NOT NULL,
            software VARCHAR(255) NOT NULL,
            cycle VARCHAR(16) NOT NULL,
            amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            start_date DATETIME NOT NULL,
            next_due DATETIME NOT NULL,
            grace_days INT NOT NULL DEFAULT 5,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            paused_at DATETIME NULL,
            INDEX (api_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_id VARCHAR(32) NOT NULL,
            ts DATETIME NOT NULL,
            action VARCHAR(32) NOT NULL,
            note TEXT NOT NULL,
            INDEX (client_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS settings (
            setting_key VARCHAR(64) PRIMARY KEY,
            setting_value VARCHAR(255) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // One row per person who can use the dashboard. The first person ever
    // to register becomes 'admin' automatically; everyone else is an
    // 'employee' created directly by the admin from the Team page — both
    // start 'active' immediately, there's no approval step. decided_at is
    // set when an admin removes someone (their access-revoked timestamp).
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL,
            role VARCHAR(16) NOT NULL DEFAULT 'employee',
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            pin_hash VARCHAR(255) NULL,
            pin_reset_requested TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            decided_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // A login issues a token kept only in the app's memory for that run
    // (never written to disk) — closing the app and reopening it always
    // requires the PIN again. Tokens are stored here so an admin removing
    // someone invalidates their access immediately, not just at expiry.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS sessions (
            token CHAR(64) PRIMARY KEY,
            user_id INT NOT NULL,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            INDEX (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Basic-details clients — no Client ID/API key/subscription cycle,
    // just contact info and a running total/advance/remaining payment.
    // Kept in their own table so they never mix with the licensed
    // 'clients' above; the two are managed as separate lists.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS normal_clients (
            id VARCHAR(32) PRIMARY KEY,
            client_name VARCHAR(255) NOT NULL,
            address TEXT NULL,
            contact VARCHAR(255) NULL,
            total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            advance_payment DECIMAL(12,2) NOT NULL DEFAULT 0,
            remaining_payment DECIMAL(12,2) NOT NULL DEFAULT 0,
            notes TEXT NULL,
            created_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Admin-created folders for the file library. Any folder can nest under
    // another (parent_id) or sit at the root (parent_id NULL).
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS folders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            parent_id INT NULL,
            created_by INT NOT NULL,
            created_at DATETIME NOT NULL,
            INDEX (parent_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Uploaded files. The bytes live on disk under uploads/ (see
    // ensure_upload_dir()) named by storage_name, never the original
    // filename, so a guessed/enumerated URL can't retrieve anything —
    // access always goes through api.php's own permission check.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            folder_id INT NULL,
            filename VARCHAR(255) NOT NULL,
            storage_name VARCHAR(64) NOT NULL,
            size_bytes BIGINT NOT NULL,
            uploaded_by INT NOT NULL,
            uploaded_at DATETIME NOT NULL,
            INDEX (folder_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Per-employee grants: an employee can see/download a file only if a
    // row exists here for (file_id, their user_id). The admin bypasses
    // this entirely and always sees everything.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS file_access (
            file_id INT NOT NULL,
            user_id INT NOT NULL,
            PRIMARY KEY (file_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Invoices generated for a client (subscription or normal). The PDF
    // itself is never stored here -- it's regenerated client-side from
    // this row whenever someone downloads it (see dashboard/src/invoices)
    // -- this table is just the record of what was issued. client_name is
    // a snapshot at issue time, so an invoice still reads correctly even
    // if the client's name is later edited or the client itself deleted.
    // The display number (e.g. "DTA-D007") is this row's own auto-
    // increment id, zero-padded -- see invoice_to_json().
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS invoices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_type VARCHAR(16) NOT NULL,
            client_id VARCHAR(32) NOT NULL,
            client_name VARCHAR(255) NOT NULL,
            description VARCHAR(255) NULL,
            amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            issued_date DATETIME NOT NULL,
            created_by INT NOT NULL,
            INDEX (client_type, client_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Extra links per client (website, Instagram, ...) with a custom name,
    // and documents (contracts etc.) kept for future reference. Both are
    // keyed by the client's id string, same as 'history'/'invoices', so they
    // stay attached when a client is converted between types. Document bytes
    // live in uploads/ (see ensure_upload_dir()), named by storage_name.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS client_links (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_id VARCHAR(32) NOT NULL,
            label VARCHAR(100) NOT NULL,
            url VARCHAR(500) NOT NULL,
            created_at DATETIME NOT NULL,
            INDEX (client_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS client_documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_id VARCHAR(32) NOT NULL,
            filename VARCHAR(255) NOT NULL,
            storage_name VARCHAR(64) NOT NULL,
            size_bytes BIGINT NOT NULL,
            uploaded_by INT NOT NULL,
            uploaded_at DATETIME NOT NULL,
            INDEX (client_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Every amount received from a client, one row per payment, so revenue
    // can be broken down by month/year/client. client_type is the kind of
    // work the money was for (a subscription renewal vs. a normal project
    // payment). client_name is a snapshot; when a client is deleted its rows
    // are kept (money already earned) with client_id prefixed "deleted:".
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS payments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_id VARCHAR(48) NOT NULL,
            client_type VARCHAR(16) NOT NULL,
            client_name VARCHAR(255) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            paid_at DATETIME NOT NULL,
            kind VARCHAR(16) NOT NULL,
            note VARCHAR(255) NULL,
            INDEX (client_id),
            INDEX (paid_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $hasDefaults = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'agencyName'")->fetchColumn();
    if ($hasDefaults === false) {
        $insert = $pdo->prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)');
        $insert->execute(['agencyName', 'DTA']);
        $insert->execute(['leadDays', '7']);
        $insert->execute(['defaultGrace', '5']);
    }

    // Holds whichever fields don't exist on a client's current type,
    // saved off when it's converted to the other type -- see
    // handle_convert_to_subscription()/handle_convert_to_normal() in
    // api.php. Added here (rather than in the CREATE TABLE above) because
    // CREATE TABLE IF NOT EXISTS doesn't touch a table that already
    // exists from before this column existed.
    ensure_column($pdo, 'clients', 'archived_data', 'JSON NULL');
    ensure_column($pdo, 'normal_clients', 'archived_data', 'JSON NULL');

    // Invoice numbers are built from the client's id (e.g. DTA-D002-01); older
    // invoices have none stored and keep their original numbering.
    ensure_column($pdo, 'invoices', 'invoice_number', 'VARCHAR(64) NULL');
    backfill_invoice_numbers($pdo);

    // Where a normal client's job stands (see NORMAL_WORK_STATUSES in api.php).
    ensure_column($pdo, 'normal_clients', 'work_status', 'VARCHAR(32) NULL');

    // Optional domain/website details, on both client types, with the date
    // the domain registration runs out (the dashboard warns before it does).
    foreach (['clients', 'normal_clients'] as $t) {
        ensure_column($pdo, $t, 'domain', 'VARCHAR(255) NULL');
        ensure_column($pdo, $t, 'website_url', 'VARCHAR(500) NULL');
        ensure_column($pdo, $t, 'domain_expiry', 'DATE NULL');
        ensure_column($pdo, $t, 'domain_start', 'DATE NULL');
    }

    // When a subscription client was first added (normal clients always had
    // created_at). Older rows get their first history entry's time, or their
    // plan start date if they have no history.
    ensure_column($pdo, 'clients', 'created_at', 'DATETIME NULL');
    $pdo->exec('
        UPDATE clients c
        SET created_at = COALESCE((SELECT MIN(h.ts) FROM history h WHERE h.client_id = c.id), c.start_date)
        WHERE c.created_at IS NULL
    ');

    run_once($pdo, 'paymentsBackfilled', 'backfill_payments');

    // Normal clients keep the advance and later payments apart: advance_payment
    // is only the advance, paid_amount is everything recorded after it.
    ensure_column($pdo, 'normal_clients', 'paid_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
    run_once($pdo, 'paidSplitDone', 'split_paid_amounts');
    run_once($pdo, 'ledgerRepair1', 'repair_payment_ledger');
}

// Gives invoices issued before client-id numbering existed the same style of
// number (e.g. DTA-D002-01), oldest first per client. Does nothing once every
// invoice has one, so it only ever does work the first time after an upgrade.
function backfill_invoice_numbers(PDO $pdo): void
{
    $rows = $pdo->query('SELECT id, client_id FROM invoices WHERE invoice_number IS NULL ORDER BY id')->fetchAll();
    if (!$rows) return;
    $taken = $pdo->prepare('SELECT 1 FROM invoices WHERE invoice_number = ?');
    $update = $pdo->prepare('UPDATE invoices SET invoice_number = ? WHERE id = ?');
    $next = [];
    foreach ($rows as $r) {
        $n = $next[$r['client_id']] ?? 1;
        while (true) {
            $number = $r['client_id'] . '-' . str_pad((string) $n, 2, '0', STR_PAD_LEFT);
            $taken->execute([$number]);
            if (!$taken->fetchColumn()) break;
            $n++;
        }
        $update->execute([$number, $r['id']]);
        $next[$r['client_id']] = $n + 1;
    }
}

// One-time: builds the payments ledger from what was recorded before it
// existed -- normal clients' advance (whatever part of advance_payment isn't
// explained by later "Payment of X recorded" history entries) at the date
// they were added, those recorded payments at their dates, and each
// subscription "Marked as paid" renewal at the plan amount. A client
// converted between types keeps both eras: its archived_data supplies the
// other era's plan amount / advance. Runs once, flagged in settings.
function backfill_payments(PDO $pdo): void
{
    $ins = $pdo->prepare('INSERT INTO payments (client_id, client_type, client_name, amount, paid_at, kind, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $hist = $pdo->prepare("SELECT ts, note FROM history WHERE client_id = ? AND action = 'paid' ORDER BY ts");

    $all = [];
    foreach ($pdo->query('SELECT * FROM normal_clients')->fetchAll() as $c) $all[] = ['normal', $c];
    foreach ($pdo->query('SELECT * FROM clients')->fetchAll() as $c) $all[] = ['subscription', $c];

    foreach ($all as [$type, $c]) {
        $archived = !empty($c['archived_data']) ? json_decode($c['archived_data'], true) : null;
        $subAmount = $type === 'subscription' ? (float) $c['amount']
            : (($archived['_type'] ?? '') === 'subscription' ? (float) $archived['amount'] : null);
        if ($type === 'normal') {
            $advance = (float) $c['advance_payment'];
            $addedAt = $c['created_at'];
        } elseif (($archived['_type'] ?? '') === 'normal') {
            $advance = (float) $archived['advancePayment'];
            $addedAt = $archived['createdAt'] ?? $c['start_date'];
        } else {
            $advance = null;
            $addedAt = null;
        }

        $hist->execute([$c['id']]);
        $recorded = 0.0;
        $rows = [];
        foreach ($hist->fetchAll() as $h) {
            if (preg_match('/Payment of ([\d,]+(?:\.\d+)?) recorded/', $h['note'], $m)) {
                $amt = (float) str_replace(',', '', $m[1]);
                $recorded += $amt;
                $rows[] = ['normal', $amt, $h['ts'], 'payment', 'Payment'];
            } elseif ($subAmount !== null) {
                $rows[] = ['subscription', $subAmount, $h['ts'], 'renewal', 'Subscription renewal'];
            }
        }
        if ($advance !== null) {
            $initial = round($advance - $recorded, 2);
            if (abs($initial) >= 0.01) {
                $ins->execute([$c['id'], 'normal', $c['client_name'], $initial, $addedAt, $initial > 0 ? 'advance' : 'adjustment', $initial > 0 ? 'Advance payment' : 'Adjustment']);
            }
        }
        foreach ($rows as [$t, $amt, $ts, $kind, $note]) {
            $ins->execute([$c['id'], $t, $c['client_name'], $amt, $ts, $kind, $note]);
        }
    }
}

// One-time: before paid_amount existed, recorded payments were added into
// advance_payment. Moves them out (using the payments ledger) so advance is
// just the advance again. Totals don't change.
function split_paid_amounts(PDO $pdo): void
{
    $sumStmt = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE client_id = ? AND client_type = 'normal' AND kind = 'payment'");
    $upd = $pdo->prepare('UPDATE normal_clients SET advance_payment = ?, paid_amount = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, advance_payment FROM normal_clients')->fetchAll() as $c) {
        $sumStmt->execute([$c['id']]);
        $paid = min((float) $sumStmt->fetchColumn(), (float) $c['advance_payment']);
        $upd->execute([round((float) $c['advance_payment'] - $paid, 2), round($paid, 2), $c['id']]);
    }
}

// Runs a one-time data fix exactly once, even when several requests arrive at
// the same moment (the dashboard sends a few at once on load). The key is
// claimed inside a transaction first; a second request trying to claim it
// waits for the first to finish, then gets a duplicate-key error and skips.
// Without this, two requests could both run the fix (which is what doubled
// some payment records before).
function run_once(PDO $pdo, string $key, callable $work): void
{
    $check = $pdo->prepare('SELECT 1 FROM settings WHERE setting_key = ?');
    $check->execute([$key]);
    if ($check->fetchColumn()) return;

    $pdo->beginTransaction();
    try {
        $pdo->prepare("INSERT INTO settings (setting_key, setting_value) VALUES (?, '1')")->execute([$key]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ((string) $e->getCode() === '23000') return;
        throw $e;
    }
    try {
        $work($pdo);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

// One-time repair: the payment records were sometimes built twice (two
// requests running the first-time setup together), so drop exact duplicate
// records, then set each normal client's advance and paid amounts from its
// records -- the records are what the Revenue page shows, so the client's
// balance and the revenue figures agree again.
function repair_payment_ledger(PDO $pdo): void
{
    $pdo->exec('
        DELETE FROM payments WHERE id IN (
            SELECT id FROM (
                SELECT p1.id FROM payments p1
                JOIN payments p2 ON p1.client_id = p2.client_id AND p1.client_type = p2.client_type
                    AND p1.amount = p2.amount AND p1.paid_at = p2.paid_at AND p1.kind = p2.kind
                    AND p1.id > p2.id
            ) dup
        )
    ');

    $sums = $pdo->prepare("
        SELECT COUNT(*) AS n,
               COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END), 0) AS paid,
               COALESCE(SUM(CASE WHEN kind IN ('advance', 'adjustment') THEN amount ELSE 0 END), 0) AS advance
        FROM payments WHERE client_id = ? AND client_type = 'normal'
    ");
    $upd = $pdo->prepare('UPDATE normal_clients SET advance_payment = ?, paid_amount = ?, remaining_payment = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, total_amount FROM normal_clients')->fetchAll() as $c) {
        $sums->execute([$c['id']]);
        $r = $sums->fetch();
        if ((int) $r['n'] === 0) continue;
        $advance = max(0, round((float) $r['advance'], 2));
        $paid = max(0, round((float) $r['paid'], 2));
        $upd->execute([$advance, $paid, max(0, round((float) $c['total_amount'] - $advance - $paid, 2)), $c['id']]);
    }
}

function ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    $stmt = $pdo->prepare('
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
    ');
    $stmt->execute([$table, $column]);
    if (!$stmt->fetchColumn()) {
        $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
    }
}

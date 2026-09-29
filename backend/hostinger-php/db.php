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

    $hasDefaults = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'agencyName'")->fetchColumn();
    if ($hasDefaults === false) {
        $insert = $pdo->prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)');
        $insert->execute(['agencyName', 'DTA']);
        $insert->execute(['leadDays', '7']);
        $insert->execute(['defaultGrace', '5']);
    }
}

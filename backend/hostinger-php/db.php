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
    return $pdo;
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
    // to complete registration becomes 'admin' automatically; everyone
    // after that is an 'employee' and starts 'pending' until the admin
    // approves them.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL,
            role VARCHAR(16) NOT NULL DEFAULT 'employee',
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
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

    $hasDefaults = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'agencyName'")->fetchColumn();
    if ($hasDefaults === false) {
        $insert = $pdo->prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)');
        $insert->execute(['agencyName', 'DTA']);
        $insert->execute(['leadDays', '7']);
        $insert->execute(['defaultGrace', '5']);
    }
}

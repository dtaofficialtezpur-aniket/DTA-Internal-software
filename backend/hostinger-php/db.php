<?php
/**
 * Database connection + one-time schema setup.
 * Mirrors backend/google-apps-script/Code.gs's ensureSheets_() — creates
 * its tables on first use so there's no separate manual import step,
 * though schema.sql is also provided if you'd rather import it by hand.
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

    $hasAdminKey = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'adminKey'")->fetchColumn();
    if ($hasAdminKey === false) {
        $adminKey = bin2hex(random_bytes(16));
        $insert = $pdo->prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)');
        $insert->execute(['adminKey', $adminKey]);
        $insert->execute(['agencyName', 'DTA']);
        $insert->execute(['leadDays', '7']);
        $insert->execute(['defaultGrace', '5']);
    }
}

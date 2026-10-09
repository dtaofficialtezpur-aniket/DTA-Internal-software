<?php
/** DB connection + automatic schema creation (same approach as the DTA subscription backend). */

date_default_timezone_set('Asia/Kolkata'); // whole team is in India; all stored times are IST

const STATES = [
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
    'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
    'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
    'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
    'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
    'Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];
const PRODUCT_TYPES = ['software', 'app', 'website'];
const STAGES = ['new', 'contacted', 'demo', 'negotiation', 'won', 'lost'];
const DEMO_STATUSES = ['pending', 'scheduled', 'completed', 'declined', 'cancelled'];
const DEMO_MODES = ['online', 'onsite'];
const ACTIVITY_TYPES = ['call', 'visit', 'meeting', 'follow_up', 'note'];

function get_config(): array
{
    $path = __DIR__ . '/config.php';
    if (!file_exists($path)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'config.php is missing. Copy config.example.php to config.php and fill it in.']);
        exit;
    }
    return require $path;
}

function get_pdo(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $c = get_config();
    $pdo = new PDO("mysql:host={$c['db_host']};dbname={$c['db_name']};charset=utf8mb4", $c['db_user'], $c['db_pass'], [
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
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            full_name VARCHAR(255) NOT NULL,
            role VARCHAR(16) NOT NULL DEFAULT 'employee',   -- 'admin' | 'employee'
            state VARCHAR(64) NULL,                         -- the state this employee covers
            status VARCHAR(16) NOT NULL DEFAULT 'active',   -- 'active' | 'locked' (admin blocked access) | 'removed'
            password_hash VARCHAR(255) NULL,                -- set by the admin; employees cannot change it themselves
            locked_at DATETIME NULL,                        -- when the admin locked the account
            failed_attempts INT NOT NULL DEFAULT 0,
            locked_until DATETIME NULL,
            created_at DATETIME NOT NULL,
            last_login_at DATETIME NULL,
            last_logout_at DATETIME NULL,                   -- set on logout so the person shows offline immediately
            last_active_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash CHAR(64) PRIMARY KEY,
            user_id INT NOT NULL,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            INDEX (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS leads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,                           -- the employee who owns this lead
            name VARCHAR(255) NOT NULL,                     -- business / person
            contact_person VARCHAR(255) NULL,
            phone VARCHAR(32) NULL,
            email VARCHAR(255) NULL,
            state VARCHAR(64) NOT NULL,
            city VARCHAR(128) NULL,
            product_type VARCHAR(16) NOT NULL,              -- software | app | website
            product_name VARCHAR(255) NULL,
            stage VARCHAR(16) NOT NULL DEFAULT 'new',
            est_value DECIMAL(12,2) NOT NULL DEFAULT 0,
            deal_value DECIMAL(12,2) NULL,                  -- set when won
            next_followup DATE NULL,
            notes TEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            won_at DATETIME NULL,
            INDEX (user_id, created_at),
            INDEX (stage),
            INDEX (won_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS activities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            lead_id INT NULL,
            lead_name VARCHAR(255) NULL,                    -- kept so history survives a deleted lead
            type VARCHAR(16) NOT NULL,                      -- call|visit|meeting|follow_up|note|lead_added|stage_change|client_won
            note TEXT NULL,
            created_at DATETIME NOT NULL,
            INDEX (user_id, created_at),
            INDEX (lead_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // An employee asks the DTA team for a product demo for a prospect; the admin schedules / declines it.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS demo_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,                           -- requesting employee
            lead_id INT NULL,
            client_name VARCHAR(255) NOT NULL,              -- prospect (copied, so it survives a deleted lead)
            contact_person VARCHAR(255) NULL,
            phone VARCHAR(32) NULL,
            state VARCHAR(64) NOT NULL,
            city VARCHAR(128) NULL,
            product_type VARCHAR(16) NOT NULL,              -- software | app | website
            product_name VARCHAR(255) NULL,
            mode VARCHAR(16) NOT NULL DEFAULT 'online',     -- online | onsite
            preferred_date DATE NULL,
            preferred_time VARCHAR(32) NULL,                -- free text, e.g. 'Morning', '4 PM'
            notes TEXT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending|scheduled|completed|declined|cancelled
            scheduled_at DATETIME NULL,
            meeting_url VARCHAR(1000) NULL,                 -- demo link (Meet / Zoom ...) pasted by the admin; the employee receives it
            admin_note TEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX (status, created_at),
            INDEX (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // Small key/value store (official links shown to employees: website, office maps, Instagram).
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS settings (
            setting_key VARCHAR(64) PRIMARY KEY,
            setting_value TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

-- Reference only. api.php/db.php create these tables automatically on
-- first request (CREATE TABLE IF NOT EXISTS) — you do NOT need to run
-- this by hand. It's here in case you'd rather import it through
-- phpMyAdmin yourself, or just want to see the shape of the data.

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id VARCHAR(32) NOT NULL,
    ts DATETIME NOT NULL,
    action VARCHAR(32) NOT NULL,
    note TEXT NOT NULL,
    INDEX (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

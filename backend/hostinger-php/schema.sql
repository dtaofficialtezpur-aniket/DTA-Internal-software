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

-- The first person ever to register becomes 'admin' automatically and
-- starts 'active'. Everyone after that registers as 'employee' and
-- starts 'pending' until the admin approves them.
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'employee',   -- 'admin' | 'employee'
    status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'rejected' | 'removed'
    pin_hash VARCHAR(255) NULL,                     -- NULL means "awaiting a PIN to be set" (new account, or after an approved reset)
    pin_reset_requested TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    decided_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Login tokens, kept only in the app's memory on the client side (never
-- written to disk there) — reopening the app always needs the PIN again.
-- Stored here so removing a user invalidates their session immediately.
CREATE TABLE IF NOT EXISTS sessions (
    token CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin-created folders for the file library. Nest under another folder
-- (parent_id) or sit at the root (parent_id NULL).
CREATE TABLE IF NOT EXISTS folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INT NULL,
    created_by INT NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uploaded files. Bytes live on disk under uploads/, named by
-- storage_name (random, not the original filename) — see
-- ensure_upload_dir() in db.php.
CREATE TABLE IF NOT EXISTS files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    folder_id INT NULL,
    filename VARCHAR(255) NOT NULL,
    storage_name VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,
    uploaded_by INT NOT NULL,
    uploaded_at DATETIME NOT NULL,
    INDEX (folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-employee grants: an employee can see/download a file only if a row
-- exists here for (file_id, their user_id). The admin bypasses this and
-- always sees everything.
CREATE TABLE IF NOT EXISTS file_access (
    file_id INT NOT NULL,
    user_id INT NOT NULL,
    PRIMARY KEY (file_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

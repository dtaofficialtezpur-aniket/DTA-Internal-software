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

-- Basic-details clients — no Client ID/API key/subscription cycle, just
-- contact info and a running total/advance/remaining payment. Kept
-- separate from 'clients' above; the two are managed as separate lists.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The first person ever to register becomes 'admin' automatically; every
-- other account is created directly by the admin from the Team page as
-- an 'employee'. Both start 'active' immediately -- no approval step.
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'employee',  -- 'admin' | 'employee'
    status VARCHAR(16) NOT NULL DEFAULT 'active',  -- 'active' | 'removed'
    pin_hash VARCHAR(255) NULL,                    -- NULL means "awaiting a PIN to be set" (new account, or after an approved reset)
    pin_reset_requested TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    decided_at DATETIME NULL                       -- set when an admin removes someone
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

-- Invoices generated for a client. The PDF itself isn't stored -- it's
-- regenerated client-side from this row on download. The display number
-- (e.g. "DTA-D007") is this row's own auto-increment id, zero-padded.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

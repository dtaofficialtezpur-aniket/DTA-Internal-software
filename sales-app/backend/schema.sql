-- Reference only. api.php / setup.php create these tables automatically; you do NOT need to import this.
-- It is here in case you prefer phpMyAdmin, or just want to see the shape of the data.

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'employee',   -- 'admin' | 'employee'
    state VARCHAR(64) NULL,                         -- the state this employee covers
    status VARCHAR(16) NOT NULL DEFAULT 'active',   -- 'active' | 'removed'
    pin_hash VARCHAR(255) NULL,                     -- NULL = waiting for the employee to set a PIN
    setup_code_hash VARCHAR(255) NULL,              -- one-time code the admin hands over for first PIN setup
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    created_at DATETIME NOT NULL,
    last_login_at DATETIME NULL,
    last_active_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
    admin_note TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX (status, created_at),
    INDEX (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


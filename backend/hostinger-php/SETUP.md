# Backend setup (Hostinger — PHP + MySQL)

Alternative to the Google Sheets backend, for when you'd rather use your
Hostinger hosting. Same dashboard, same desktop app, same contract — you
just point Settings → Backend URL at this instead.

## 1. Create the MySQL database
1. Log into **hPanel** → **Databases** → **MySQL Databases**.
2. Create a new database and a database user (set a password), and attach
   the user to the database with full privileges.
3. Note down: database name, username, password, host (usually `localhost`).

## 2. Upload the files
1. Go to **Files** → **File Manager** (or connect via FTP).
2. Create a folder for this, e.g. `subctl/`, under your domain's `public_html`.
3. Upload every file from `backend/hostinger-php/` **except** `.gitignore`:
   `api.php`, `db.php`, `setup.php`, `config.example.php`, `schema.sql`.
4. Rename `config.example.php` to `config.php` (or upload a copy under
   that name), then edit it in File Manager and fill in the real database
   name/user/password/host from step 1.

## 3. Run setup once
1. Visit `https://yourdomain.com/subctl/setup.php` in a browser.
2. It creates the tables and prints an **Admin key** — copy it.
3. Delete `setup.php` from the server afterward (or at least don't link to
   it) — anyone who loads it can read the admin key.

## 4. Wire it into the dashboard / desktop app
1. Open the dashboard (or the desktop app) → **Settings**.
2. Backend URL: `https://yourdomain.com/subctl/api.php`
3. Admin key: what `setup.php` printed.
4. Save & connect.

## Notes
- `api.php`/`db.php` create their own tables automatically on first
  request — `schema.sql` is just a reference if you'd rather import by
  hand through phpMyAdmin.
- All database queries use prepared statements (no string-built SQL), and
  the admin key is compared with a constant-time check — same baseline
  protections as any backend, not something you need to configure.
- `config.php` holds real database credentials — it's in `.gitignore` on
  purpose; never commit it.
- Make sure the site is served over **HTTPS** (Hostinger gives you a free
  SSL certificate in hPanel → SSL) — the admin key and client API keys
  should never travel over plain HTTP.

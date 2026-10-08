# DTA Sales — backend setup (Hostinger or any PHP + MySQL host)

You need: a domain with HTTPS (e.g. `dtaonline.in`), PHP 8.0+, and one MySQL database. Allow ~15 minutes.

## 1. Create the database (hPanel)
Websites → your site → **Databases → MySQL Databases** → create a database + user. Write down the database name, username and password (Hostinger prefixes them, e.g. `u123456789_sales`).

## 2. Upload the backend files
hPanel → **File Manager** → `public_html` → create a folder named **`DTA_Sales`** (the app expects `https://dtaonline.in/DTA_Sales/api.php`).
Upload everything from this `backend/` folder into it: `api.php`, `db.php`, `setup.php`, `reset-admin-pin.php`, `config.example.php`, `.htaccess`.
(Tip: download this repo as a ZIP from GitHub, unzip it, and upload the files from `sales-app/backend/`.)

## 3. Create `config.php`
In File Manager, copy `config.example.php` → `config.php`, edit it:
- `db_host` `'localhost'`, `db_name` / `db_user` / `db_pass` from step 1
- `notify_email` (optional) — your email; you get a message whenever an employee requests a demo. Leave `''` to rely on the in-app badge only. (Uses the server's mail(); check spam the first time.)
- **`admin_key`** — your main portal key. At least 16 characters, random, e.g. made with a password manager. Keep it private; it is the only thing that lets someone create the admin account. Don't share it with employees.

## 4. Run the setup check
Open `https://dtaonline.in/DTA_Sales/setup.php`. It checks PHP, the database and HTTPS, creates the tables, and deletes itself when everything is **[ OK ]**. If it says **[FAIL]**, fix that line and reload. (If it can't delete itself, delete `setup.php` in File Manager.)

Also open `https://dtaonline.in/DTA_Sales/api.php` — you should see `{"ok":true,"service":"dta-sales-api"}`.

## 5. Create your admin account
Open the DTA Sales app → **Create admin account** → enter the admin key, your name, a username and a 6-digit PIN. This works only once; afterwards nobody can create another admin.

## 6. Add employees
Sales team → **Add employee** (name, username, state). Send each employee the app installer plus their **one-time setup code**; they tap “First time? Set your PIN”.

## If something goes wrong
- **Admin forgot PIN:** open `https://dtaonline.in/DTA_Sales/reset-admin-pin.php`, enter the admin key and a new PIN, then delete that file.
- **Employee forgot PIN:** Sales team → Reset PIN (gives a new setup code).
- **App says “Could not reach the server”:** check the URL in `dashboard/src/constants.js`, that the files are in the `DTA_Sales` folder, and that the site uses HTTPS.
- **Server error:** check the PHP error log in hPanel; the most common cause is a wrong value in `config.php`.

## Security notes
PINs are stored hashed; 5 wrong attempts lock an account for 15 minutes; sessions last 12 hours and are not kept after the app closes; removing an employee logs them out immediately; `.htaccess` blocks `config.php` and internals from being downloaded. Keep **`reset-admin-pin.php` deleted** when you're not using it, and take backups from the Sales team page regularly. Also enable hPanel's automatic database backups if your plan has them.

# DTA Sales backend setup (PHP + MySQL, e.g. Hostinger)

1. In hPanel create a MySQL database + user.
2. Upload this folder's files (`api.php`, `db.php`, `setup.php`, `config.example.php`) to a folder on your domain.
3. Copy `config.example.php` to `config.php` and fill in the DB details and **`admin_key`** — a long random string only you know. This is the main portal key.
4. Open `setup.php` once in the browser (HTTPS) to create the tables, then delete it.
5. Put the URL of `api.php` in `dashboard/src/constants.js` (`BACKEND_URL`) and in the CSP `connect-src` of `dashboard/index.html`, then `npm run build`.
6. Open the app → **Create admin account** → enter the admin key. This works only until the first admin exists.
7. Admin → **Sales team** → **Add employee** (name, username, state). You get a one-time setup code; send it to the employee. They tap **First time? Set your PIN**.

Security notes: PINs are hashed; 5 wrong attempts lock an account for 15 minutes; sessions last 12 hours and are not kept after the app closes; removing an employee logs them out immediately. Use HTTPS only.

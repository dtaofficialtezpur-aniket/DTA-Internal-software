# Backend setup (Hostinger — PHP + MySQL)

## 1. Create the MySQL database
1. Log into **hPanel** → **Databases** → **MySQL Databases**.
2. Create a new database and a database user (set a password), and attach
   the user to the database with full privileges.
3. Note down: database name, username, password, host (usually `localhost`).

This can live on the same hosting account as an existing website — it
doesn't need to be a separate hosting plan. Just give the database a
distinct name; it won't be attached to or mixed with anything else on that
account.

## 2. Upload the files
1. Go to **Files** → **File Manager** (or connect via FTP).
2. Create a folder for this, e.g. `subctl/`, under your domain's
   `public_html` — a plain new folder, separate from any existing site's
   files.
3. Upload every file from `backend/hostinger-php/` **except** `.gitignore`
   and this `SETUP.md`:
   `api.php`, `db.php`, `setup.php`, `reset-admin-pin.php`,
   `config.example.php`, `schema.sql`.
4. Rename `config.example.php` to `config.php` (or upload a copy under
   that name), then edit it in File Manager and fill in the real database
   name/user/password/host from step 1.

## 3. Run setup once
1. Visit `https://yourdomain.com/subctl/setup.php` in a browser.
2. It creates the database tables. That's all it does now — there's no
   admin key to copy.
3. You can delete `setup.php` afterward if you like; running it again is
   harmless either way (it only creates tables that don't already exist).

## 4. Point the app at this backend
The Backend URL isn't typed into the app — it's a constant baked into
`dashboard/src/constants.js` (`BACKEND_URL`, near the top of the file),
since this whole team shares one backend. Before first use, open that
file and set it to `https://yourdomain.com/subctl/api.php`, and update
the `connect-src` value in the CSP `<meta>` tag near the top of
`dashboard/index.html` to match your domain. Then rebuild the dashboard
(`cd dashboard && npm run build`, or just `npm start`/`npm run dist*` in
`desktop/`, which do this automatically) — these two edits plus a
rebuild cover both the browser and desktop app.

## 5. Register the admin account
1. Open the dashboard (or the desktop app).
2. Click **Register**. This only ever works once — the **first account
   ever created becomes the admin automatically**. Fill in your name, pick
   a username, and choose a 6-digit PIN.
3. You're in. Every time the app is reopened, you log in again with that
   username + PIN — no persistent session.

## 6. Adding your team
- Employees don't self-register. From the admin's **Team** page, click
  **Add employee** and give their name + a username — no PIN needed from
  you. They set their own PIN the first time they log in with that
  username.
- Removing someone from Team revokes their access immediately — their next
  action anywhere in the app sends them back to the login screen, and they
  can't log back in.
- If someone forgets their PIN: they click **Forgot PIN** on the login
  screen, and the request shows up on your **Team** page for you to
  approve. Once approved, they set a brand-new PIN on their next login
  attempt — no email needed.

## If the admin forgets their PIN
There's no one above the admin to approve a reset for them, so this one
case works differently: visit `https://yourdomain.com/subctl/reset-admin-pin.php`
once. It clears the admin account's PIN — log in with the admin's username
and it'll prompt for a new PIN, no old PIN needed. **Delete this file from
the server afterward** — anyone who can load it can do the same. Having
file/FTP access to the server is what proves it's really you, same as
`setup.php`.

## 7. File sharing
- From the admin's **Files** page: create folders, upload files into them,
  and for each file choose which employees can see and download it (click
  **Manage access** on that file's row). Everyone else stays locked out —
  an employee only sees files explicitly checked for them, nothing else in
  the folder.
- Uploaded files are stored in a new `uploads/` folder next to `api.php`,
  created automatically on first upload — nothing to set up by hand.
  It's locked down with its own `.htaccess` so nobody can fetch a file by
  guessing its URL; every download goes through the same login+access
  check as everything else in the app.

## 8. Autofill new clients from an uploaded document
- Both "Add client" forms (Subscription and Normal) have an "Upload a
  document to autofill" button — upload a PDF or photo of a client's
  details and it fills the form for you to review before creating.
- This needs an Anthropic API key: get one at
  https://console.anthropic.com/, then add it to `config.php` as
  `anthropic_api_key`. Leave it `null` (the default) to leave the button
  disabled — nothing else in the app is affected either way.
- Each upload costs a small amount (a few cents) against that API key's
  billing — it's not free, but there's no separate step to enable it
  beyond adding the key.

## Notes
- `api.php`/`db.php` create their own tables automatically on first
  request — `schema.sql` is just a reference if you'd rather import by
  hand through phpMyAdmin.
- All database queries use prepared statements (no string-built SQL); PINs
  are hashed (never stored in plain text) and compared safely; login
  session tokens are checked against the database on every request, so
  removing someone's access takes effect immediately, not just when their
  token would naturally expire.
- `config.php` holds real database credentials — it's in `.gitignore` on
  purpose; never commit it.
- Make sure the site is served over **HTTPS** (Hostinger gives you a free
  SSL certificate in hPanel → SSL) — PINs and API keys should never travel
  over plain HTTP.

# Backend setup (Google Sheets + Apps Script)

No local install needed — everything runs on Google's servers, free.

## 1. Create the Sheet
1. Go to sheets.google.com → **Blank spreadsheet**.
2. Rename it, e.g. "DTA Subscription Control — Data".

## 2. Add the script
1. In the Sheet: **Extensions → Apps Script**.
2. Delete the placeholder code in `Code.gs`, paste in the contents of
   `backend/google-apps-script/Code.gs` from this repo.
3. Save (Ctrl/Cmd+S).

## 3. Run setup once
1. In the Apps Script editor, pick **setup** from the function dropdown (top toolbar, next to the Run button) and click **Run** (▶).
2. First run asks you to authorize the script:
   - Click **Review permissions** → pick your Google account → you'll see an "unverified app" warning (normal, since it's your own private script) → click **Advanced** → **Go to \<project name\> (unsafe)** → **Allow**.
3. Switch back to the **Sheet tab** (not the script editor) — a popup titled "Setup complete" appears there showing your **Admin key**. Copy it now.
   - If you missed the popup, open the Sheet's **Settings** tab — the key is in the row labeled `adminKey`.
4. You should now see three tabs on the Sheet: `Clients`, `History`, `Settings`.

## 4. Deploy as a Web App
1. In Apps Script: **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Settings:
   - Execute as: **Me**
   - Who has access: **Anyone** (this makes the URL callable by client software; the admin key still protects write actions, and each client's own API key protects their status check)
4. Click **Deploy**, authorize again if asked.
5. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec`

## 5. Wire it into the dashboard
1. Open `dashboard/index.html` in a browser.
2. Go to **Settings** → paste the Web app URL into **Backend URL**, and the Admin key from step 3 into **Admin key** → Save.
3. The dashboard now reads/writes the Google Sheet instead of local storage.

## 6. Test the status check
Add a client from the dashboard, open it, copy its **Client ID** and **API key**. Then open this URL in a browser (fill in your real values):

`<your Web app URL>?action=status&client_id=<id>&api_key=<key>`

You should get back JSON like `{"status":"active", ...}`. Pause that client from the dashboard and reload the same URL — it should flip to `{"status":"paused", ...}`.

## Notes / limits
- This is a good **testing/prototype backend** — it's free and needs zero server setup. For production with many clients or heavier traffic, move to a real hosted backend (Node/Postgres etc.) later — the client software and dashboard barely change, they just point at a new URL.
- The admin key is stored in the `Settings` sheet — do not share the Sheet or the key publicly. Anyone with the admin key can pause/resume/add clients via the API.
- Each client's own `api_key` (in the `Clients` sheet) is what its software uses for the read-only status check — keep that private to that client's install, per the dashboard's existing security note.

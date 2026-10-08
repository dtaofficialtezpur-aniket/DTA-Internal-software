# DTA Sales — desktop app

Electron wrapper that packages `../dashboard/dist` as an installable app for the sales team
(Windows installer, Mac dmg, Linux AppImage), same hardened setup as the main DTA desktop app:
sandboxed window, no permissions, network limited to the backend host + GitHub (for updates).

- Try it: `npm install && npm start` (builds the dashboard first).
- Installers: `npm run dist:win` (run on Windows), `dist:mac`, `dist:linux`.
- Or let GitHub build all three: Actions → **Build sales desktop app** → Run workflow. It publishes the installers to the
  releases repo named in `package.json` → `build.publish` (create that repo and add a `RELEASES_REPO_TOKEN` secret first).
  Send employees the installer; installed copies check for newer versions every 6 hours and show a "Restart to update" button.
- If your backend is not on `dtaonline.in`, add its host to `ALLOWED_HOSTS` in `main.js`.

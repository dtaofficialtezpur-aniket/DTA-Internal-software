// Shared mutable state, imported by every other module. Kept as one
// object (not separate top-level `let` exports) so a change made in one
// module is immediately visible to every other module that imported it.

// One fixed backend for this whole organization — baked in here rather
// than typed into a Settings field. It isn't a secret (it's just a URL,
// same as any API endpoint); what actually protects the data behind it
// is the login system. To point this build at a different backend,
// change this constant and the matching CSP connect-src in index.html.
export const BACKEND_URL = 'https://dtaonline.in/DTA_Internal/api.php';

export const TODAY = new Date();

export const state = {
  settings: { name: 'DTA', lead: 7, grace: 5 },
  clients: [],
  selectedId: null,
  // Never persisted to disk — every app launch requires the PIN again.
  auth: { token: null, user: null },
  pendingSetPinUsername: null,
  folders: [],
  files: [],
  accessModalFileId: null,
};

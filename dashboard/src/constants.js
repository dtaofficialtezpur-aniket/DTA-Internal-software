// One fixed backend for this whole organization — baked in here rather
// than typed into a Settings field. It isn't a secret (it's just a URL,
// same as any API endpoint); what actually protects the data behind it
// is the login system. To point this build at a different backend,
// change this constant and the matching CSP connect-src in index.html.
export const BACKEND_URL = 'https://dtaonline.in/DTA_Internal/api.php';

/** Prefix for files in /public so the app also works when hosted under a sub-path (e.g. GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const asset = (p: string) => `${BASE_PATH}${p.startsWith('/') ? p : '/' + p}`;

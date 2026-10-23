/** @type {import('next').NextConfig} */
// Static export: the app has no server, all data lives in the browser (localStorage),
// so it can be hosted on any static host and works offline once the service worker is installed.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;

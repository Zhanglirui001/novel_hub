/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tauri ships the UI as immutable assets. Runtime state lives exclusively
  // behind the local FastAPI sidecar, so no Node.js server is needed in prod.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.0.103",
    "192.168.0.104",
  ],
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.0.103",
    "192.168.0.104",
  ],
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle (server.js + only the deps it needs) —
  // keeps the production Docker image small instead of shipping the
  // whole monorepo's node_modules.
  output: 'standalone',
};

module.exports = nextConfig;

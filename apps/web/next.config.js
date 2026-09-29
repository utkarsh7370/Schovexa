/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle (server.js + only the deps it needs) —
  // keeps the production Docker image small instead of shipping the
  // whole monorepo's node_modules.
  output: 'standalone',
  // Next 14.2 still gates src/instrumentation.ts behind this flag (it
  // only became unconditional in Next 15) — without it, the file is
  // silently never loaded, no error, no warning.
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;

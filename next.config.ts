import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // PGlite ships its own WASM + data files; let Node resolve it instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // This project is its own root (a stray lockfile higher up must not be picked instead).
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

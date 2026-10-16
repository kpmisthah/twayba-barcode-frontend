import type { NextConfig } from "next";

/** Where the NestJS API runs. The browser never calls it directly — see rewrites below. */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // The app and the API share one origin: phones on HTTPS can't call an http://localhost API,
  // and "localhost" on a phone is the phone itself.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
    ];
  },
  // Let phones on the local network (and an HTTPS tunnel) load the dev server.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.trycloudflare.com"],
};

export default nextConfig;

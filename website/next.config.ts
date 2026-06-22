import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The token/DAO experience now lives at its own subdomain.
      { source: "/goals", destination: "https://token.starchild.software", permanent: true },
      { source: "/goals/:path*", destination: "https://token.starchild.software/:path*", permanent: true },
    ];
  },
};

export default nextConfig;

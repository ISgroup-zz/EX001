import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions handle every mutation in this app; forms post larger line grids.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in $HOME otherwise confuses
  // Next's auto-detection.
  turbopack: {
    root: __dirname,
  },
  // Habits and Water were removed (Oct 2026); send old links somewhere useful.
  async redirects() {
    return [
      { source: "/habits", destination: "/nutrition", permanent: false },
      { source: "/water", destination: "/nutrition", permanent: false },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in $HOME otherwise confuses
  // Next's auto-detection.
  turbopack: {
    root: __dirname,
  },
  // Habits was removed (Oct 2026); alcohol logging lives on Nutrition.
  async redirects() {
    return [{ source: "/habits", destination: "/nutrition", permanent: false }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.exercisedb.dev",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "assets.exercisedb.dev",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "cdn.exercisedb.dev",
        pathname: "/media/**",
      },
    ],
  },
};

export default nextConfig;

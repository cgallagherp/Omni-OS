import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and permission-scoped, so pages render dynamically.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;

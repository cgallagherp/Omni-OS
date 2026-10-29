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
    // Integration documents are uploaded one file per request (15 MB maximum per file)
    serverActions: { bodySizeLimit: "16mb" },
    proxyClientMaxBodySize: "16mb",
  },
};

export default nextConfig;

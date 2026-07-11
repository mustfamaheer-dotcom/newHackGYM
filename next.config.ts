import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/.next/**",
        "**/download/**",
        "**/db/**",
        "**/*.log",
        "**/*.tsbuildinfo",
        "**/*.db",
        "**/*.db-journal",
        "**/*.db-wal",
        "**/*.db-shm",
      ],
    };
    return config;
  },
};

export default nextConfig;

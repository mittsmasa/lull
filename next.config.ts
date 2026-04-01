import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      "@phosphor-icons/react",
      "radix-ui",
      "better-auth",
      "motion",
    ],
  },
};

export default nextConfig;

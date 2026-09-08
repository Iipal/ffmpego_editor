import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo workspace packages ship TS source; transpile them so
  // Turbopack applies Next's TS resolution (.js -> .ts ESM mapping).
  transpilePackages: ["@repo/contracts", "@repo/types"],
  // bundle-barrel-imports: let Next.js rewrite barrel imports to direct paths
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons", "sonner"],
  },
};

export default nextConfig;

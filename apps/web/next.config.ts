import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo workspace packages ship TS source; transpile them so
  // Turbopack applies Next's TS resolution (.js -> .ts ESM mapping).
  // No `@repo/ui` entry: no such package exists (primitives live in
  // local components/ui, already part of the app graph).
  transpilePackages: ["@repo/contracts", "@repo/types", "@repo/ffmpeg-filters"],
  // bundle-barrel-imports: let Next.js rewrite barrel imports to direct paths
  // (@radix-ui/react-icons dropped: package not installed, zero imports).
  experimental: {
    optimizePackageImports: ["lucide-react", "sonner"],
  },
};

export default nextConfig;

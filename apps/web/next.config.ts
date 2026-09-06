import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // bundle-barrel-imports: let Next.js rewrite barrel imports to direct paths
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons", "sonner"],
  },
};

export default nextConfig;

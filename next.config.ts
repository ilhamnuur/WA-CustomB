import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "bcryptjs"],
};

export default nextConfig;

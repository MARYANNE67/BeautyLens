import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth"],
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;

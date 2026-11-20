import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "exceljs", "mammoth"],
  experimental: {
    serverActions: { bodySizeLimit: "64mb" },
  },
};

export default nextConfig;

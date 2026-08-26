import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the preview gateway origin(s) to access the Next.js dev server.
  allowedDevOrigins: [
    "*.space-z.ai",
    "*.chatglm.cn",
    "*.z.ai",
    "localhost",
    "127.0.0.1",
  ],
  // Serve the standalone build output (smaller, faster cold starts on Vercel).
  output: "standalone",
  // PWA assets + sql.js WASM files are in /public and served statically.
  // Next.js API routes (src/app/api/*) run as serverless functions on Vercel.
};

export default nextConfig;

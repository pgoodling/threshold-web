import type { NextConfig } from "next";

// Native Next.js on Vercel — server routes are needed for secure Stripe calls.
const nextConfig: NextConfig = {
  images: {
    unoptimized: true, // we use plain <img> tags, not next/image
  },
};

export default nextConfig;

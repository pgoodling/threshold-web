import type { NextConfig } from "next";

// Static export for GitHub Pages, served at https://threshold.salon
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true, // GitHub Pages has no image optimization server
  },
};

export default nextConfig;

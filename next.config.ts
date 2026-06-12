import type { NextConfig } from "next";

// Static export for GitHub Pages. The site is served from
// https://<user>.github.io/threshold-web/ until a custom domain is attached,
// so production builds need the repo name as a base path.
const isProd = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/threshold-web" : "",
  images: {
    unoptimized: true, // GitHub Pages has no image optimization server
  },
};

export default nextConfig;

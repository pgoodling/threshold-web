import type { NextConfig } from "next";

// Native Next.js on Vercel — server routes are needed for secure Stripe calls.
const nextConfig: NextConfig = {
  images: {
    unoptimized: true, // we use plain <img> tags, not next/image
  },

  // Supplier order PDFs are read in /api/money/invoice with pdf-parse, which
  // is pdfjs-dist underneath. Bundled by Turbopack it threw at module load:
  //
  //   ReferenceError: DOMMatrix is not defined
  //
  // because pdfjs reaches for browser drawing APIs while initialising, and the
  // bundled copy has no way to take its own Node code path. Left external it
  // is resolved with a plain require at runtime, finds its Node build, and
  // warns harmlessly about canvas instead of crashing. Text extraction never
  // needed canvas.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;

import type { MetadataRoute } from "next";

// Required for `output: export` — emit a static manifest file at build time.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Threshold — Studio by Evelyn",
    short_name: "Threshold",
    description: "Book appointments and manage Threshold salon.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf6f1",
    theme_color: "#faf6f1",
    icons: [
      {
        src: "/threshold-logos/threshold-logo-cream.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

import type { Metadata } from "next";

// Give /studio its own PWA identity so "Add to Home Screen" installs a
// separate app that launches straight into the admin (start_url /studio),
// distinct from the public booking app installed from the homepage.
export const metadata: Metadata = {
  title: "Threshold Studio",
  manifest: "/studio.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Threshold Studio",
    statusBarStyle: "default",
  },
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

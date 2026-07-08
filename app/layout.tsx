import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Threshold — Studio by Evelyn",
  description:
    "Threshold, Studio by Evelyn — expert cuts, color, and styling in Kettering, OH. Coming soon to Salon Lofts on E. Stroop Rd.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Threshold",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/threshold-logos/threshold-logo-cream.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf6f1",
};

// Local-business structured data for Google Search/Maps discoverability.
// Phone and opening hours intentionally omitted until the real ones are set.
const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "HairSalon",
  name: "Threshold — Studio by Evelyn",
  url: "https://threshold.salon",
  image: "https://threshold.salon/threshold-logos/threshold-logo-cream.png",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Salon Lofts, 424 E. Stroop Rd.",
    addressLocality: "Kettering",
    addressRegion: "OH",
    postalCode: "45429",
    addressCountry: "US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessSchema),
          }}
        />
        {children}
      </body>
    </html>
  );
}

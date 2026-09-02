import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lafayette Pulse — Map, calendar & who's who",
  description:
    "Civic pulse for Lafayette, California — map, calendar, and who's who from public records.",
  keywords: [
    "Lafayette",
    "California",
    "civic",
    "calendar",
    "who's who",
    "public records",
    "city projects",
  ],
};

import ChatWidget from "./components/ChatWidget";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={dmSans.variable}>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="bg-cream-50 text-forest-800 font-body antialiased">
        {children}
        <ChatWidget />
        <Script
          data-goatcounter="https://genemaggio.goatcounter.com/count"
          src="//gc.zgo.at/count.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

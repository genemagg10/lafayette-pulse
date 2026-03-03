import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibrant Lafayette — Community Project Tracker",
  description:
    "Track bike safety, pedestrian improvements, Safe Routes to School, traffic calming, and city projects in Lafayette, California.",
  keywords: [
    "Lafayette",
    "California",
    "community",
    "projects",
    "bike safety",
    "pedestrian",
    "Safe Routes to School",
    "traffic calming",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
      </body>
    </html>
  );
}

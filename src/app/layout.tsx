// src/app/layout.tsx
import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";
import SiteChrome from "@/components/SiteChrome";

const siteTitle = "EduLife OS | School Operations & Educational Governance";
const siteDescription =
  "EduLife OS connects teaching, attendance, assessment, school leadership, family engagement, and educational governance in one evidence-led operating system.";

export const metadata: Metadata = {
  metadataBase: new URL("https://edulifeos.com"),
  title: {
    default: siteTitle,
    template: "%s | EduLife OS",
  },
  description: siteDescription,
  applicationName: "EduLife OS",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      {
        url: "/edulife-os-search-icon.png",
        type: "image/png",
        sizes: "96x96",
      },
    ],
    shortcut: ["/edulife-os-search-icon.png"],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "EduLife OS",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/edulife-os-logo.png",
        alt: "EduLife OS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/edulife-os-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}

// src/app/layout.tsx
import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";
import SiteChrome from "@/components/SiteChrome";

export const metadata: Metadata = {
  title: "EduLife OS",
  description: "EduLife OS",
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

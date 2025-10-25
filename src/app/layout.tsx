import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Ayitikope M/A Basic School",
  description: "Knowledge, Character, Service.",
};

// move color to viewport (Next recommendation)
export const viewport: Viewport = {
  themeColor: "#00205B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Header />
        <main className="container mx-auto px-4 sm:px-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

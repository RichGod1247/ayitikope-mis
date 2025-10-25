import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Ayitikope M/A Basic School",
  description: "Knowledge, Character, Service.",
};

export const viewport: Viewport = {
  themeColor: "#1f6fff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <Header />
        {/* spacer to offset the fixed header (Header is h-16) */}
        <div className="h-16" />
        {children}
        <footer className="py-6 text-center text-sm text-gray-600">
          © {new Date().getFullYear()} Ayitikope M/A Basic School. All rights reserved.
        </footer>
      </body>
    </html>
  );
}

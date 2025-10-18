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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Header />
        <main className="container mx-auto px-6 py-10">
          {children}
        </main>
        <footer className="py-6 text-center text-sm text-gray-600">
          © {new Date().getFullYear()} Ayitikope M/A Basic School. All rights reserved.
        </footer>
      </body>
    </html>
  );
}

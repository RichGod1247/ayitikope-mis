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
        <footer className="mt-10 border-t bg-white/70">
  <div className="container mx-auto px-6 py-8 grid gap-6 sm:grid-cols-3">
    <div>
      <div className="font-semibold">Ayitikope M/A Basic School</div>
      <div className="mt-1 text-sm text-gray-600">
        Ayitikope, Volta Region, Ghana
      </div>
      <div className="text-sm text-gray-600">Email: ayitikope.basic@example.com</div>
    </div>

    <div>
      <div className="font-semibold">Quick Links</div>
      <ul className="mt-2 space-y-1 text-sm text-gray-700">
        <li><a className="hover:text-[--color-brand-600]" href="/">Home</a></li>
        <li><a className="hover:text-[--color-brand-600]" href="/about">About</a></li>
        <li><a className="hover:text-[--color-brand-600]" href="/gallery">Gallery</a></li>
        <li><a className="hover:text-[--color-brand-600]" href="/contact">Contact</a></li>
      </ul>
    </div>

    <div className="text-sm text-gray-600">
      © {new Date().getFullYear()} Ayitikope M/A Basic School. All rights reserved.
      <div className="mt-2">Motto: “Knowledge, Character, Service.”</div>
    </div>
  </div>
</footer>

      </body>
    </html>
  );
}

// src/app/contact/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact • Ayitikope M/A Basic School",
  description: "Reach the Head Teacher and Assistant Heads. Send a message or WhatsApp us directly.",
};

// ✅ Default export must be a React component that returns children
export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// src/app/contact/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact & Deployment • EduLife OS",
  description:
    "Speak with the EduLife OS team about school demos, pilot rollout, implementation, and partnership.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
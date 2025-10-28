// src/app/admissions/apply/page.tsx
import Image from "next/image";
import ApplyForm from "../../../components/ApplyForm";

export const metadata = { title: "Apply Online • Admissions" };

export default function ApplyPage() {
  return (
    <main className="container mx-auto px-6 py-10 space-y-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid sm:grid-cols-[1.1fr_1fr] items-stretch">
          <div className="p-6 sm:p-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-800">
              Apply Online
            </h1>
            <p className="mt-2 text-gray-700 max-w-2xl">
              Submit your application for <strong>KG</strong>, <strong>Primary</strong>, or <strong>JHS</strong>.
              You’ll receive confirmation via WhatsApp and email.
            </p>
          </div>
          <div className="relative min-h-[200px] sm:min-h-[260px]">
            <Image src="/admissions.png" alt="Admissions" fill className="object-cover" />
            <div className="absolute inset-0 bg-linear-to-b from-black/10 via-black/0 to-black/15" />
          </div>
        </div>
      </div>

      <ApplyForm />
    </main>
  );
}

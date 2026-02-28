//src/components/FormLogo.tsx
"use client";

import Image from "next/image";

export default function FormLogo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="text-center mb-6">
      <Image
        src="/logo.png"          // make sure public/logo.png exists
        alt="Ayitikope M/A Basic School"
        width={72}
        height={72}
        className="mx-auto rounded-md"
        priority
      />
      <h2 className="mt-2 text-xl font-bold text-blue-800">
        Ayitikope M/A Basic School
      </h2>
      {subtitle && (
        <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

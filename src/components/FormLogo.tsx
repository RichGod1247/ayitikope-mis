//src/components/FormLogo.tsx
"use client";

import Image from "next/image";

export default function FormLogo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-[#E8C96A]/20 bg-white/5 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
        <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-[#E8C96A]/25 bg-white/5">
          <Image
            src="/edulife-os-logo.png"
            alt="EduLife OS"
            width={72}
            height={72}
            className="h-full w-full object-contain p-1"
            priority
          />
        </div>

        <div className="text-left">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
            EduLife OS
          </h2>
          <p className="text-xs text-[#C9CDD6]">Build Minds. Power Futures.</p>
        </div>
      </div>

      {subtitle ? (
        <p className="mt-4 text-sm leading-6 text-[#C9CDD6]">{subtitle}</p>
      ) : null}
    </div>
  );
}
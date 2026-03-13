"use client";

import Image from "next/image";

type HeroSplineProps = {
  sceneUrl?: string;
};

export default function HeroSpline({ sceneUrl }: HeroSplineProps) {
  const hasScene =
    Boolean(sceneUrl) &&
    !String(sceneUrl).includes("YOUR_SPLINE_EMBED_URL_HERE");

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(27,102,209,0.18),transparent_34%)]" />

      <div className="absolute inset-[18px] overflow-hidden rounded-[28px] border border-white/10 bg-[#071221]/90">
        {hasScene ? (
          <iframe
            src={sceneUrl}
            title="EduLife OS 3D Hero"
            className="h-full w-full"
            frameBorder="0"
            allowFullScreen
          />
        ) : (
          <div className="relative flex h-full items-center justify-center">
            <div className="absolute h-72 w-72 rounded-full bg-[#1B66D1]/18 blur-3xl" />
            <div className="absolute h-48 w-48 rounded-full border border-[#E8C96A]/14" />
            <div className="absolute h-60 w-60 rounded-full border border-white/6" />

            <div className="relative flex flex-col items-center text-center">
              <div className="relative h-28 w-28 overflow-hidden rounded-3xl border border-[#E8C96A]/25 bg-white/5 shadow-[0_0_40px_rgba(212,175,55,0.14)]">
                <Image
                  src="/edulife-os-logo.png"
                  alt="EduLife OS"
                  fill
                  className="object-contain p-3"
                  priority
                />
              </div>

              <div className="mt-6 max-w-sm px-6">
                <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                  Spline Hero Slot
                </div>
                <p className="mt-3 text-sm leading-7 text-[#C9CDD6]">
                  Paste your published Spline embed URL into
                  <span className="mx-1 font-semibold text-[#F7F4ED]">
                    HeroSpline.tsx
                  </span>
                  to replace this fallback with the real 3D centerpiece.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-[36px] ring-1 ring-white/6" />
    </div>
  );
}
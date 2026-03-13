//src/components/HeroMedia.tsx
"use client";

type HeroMediaProps = {
  videoSrc?: string;
  posterSrc?: string;
};

export default function HeroMedia({
  videoSrc = "/hero/edulife-hero-loop.mp4",
  posterSrc = "/hero/edulife-hero-poster.png",
}: HeroMediaProps) {
  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] shadow-[0_20px_80px_rgba(0,0,0,0.40)] backdrop-blur-xl sm:h-[420px] lg:h-[560px] lg:rounded-[36px] lg:shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(27,102,209,0.18),transparent_34%)]" />

      <div className="absolute inset-[12px] overflow-hidden rounded-[20px] border border-white/10 bg-[#071221]/90 sm:inset-[16px] sm:rounded-[24px] lg:inset-[18px] lg:rounded-[28px]">
        <video
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={posterSrc}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(5,7,11,0.18)_100%)]" />
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-white/6 lg:rounded-[36px]" />
    </div>
  );
}
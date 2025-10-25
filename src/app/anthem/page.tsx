"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function AnthemPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
    };
  }, []);

  return (
    <main className="container mx-auto px-6 py-10 max-w-4xl">
      <h1 className="text-4xl font-extrabold text-blue-900 mb-6">School Anthem</h1>

      <div className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow mb-8">
        <div className="relative w-20 h-20 rounded-xl overflow-hidden ring-2 ring-blue-200">
          <Image
            src="/gallery/composer.jpg"   // add a photo here
            alt="Composer"
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-blue-900">Miss Fumador Gertrude Deladem</div>
          <div className="text-sm text-gray-600">Composer</div>
        </div>

        <div className="flex items-end gap-1 h-6">
          {[0,1,2,3,4].map((i) => (
            <span
              key={i}
              className={`w-1.5 bg-blue-600 rounded-sm transition-all duration-200 ${playing ? "eqbar" : "opacity-30"}`}
              style={{ height: playing ? `${6 + (i % 3) * 6}px` : "6px" }}
            />
          ))}
        </div>
      </div>

      <div className="prose max-w-none">
        <p className="text-lg sm:text-xl leading-8">
          <strong>We stand as one, united we stand</strong><br />
          Ayitikope Basic School, our noble land<br />
          Upon this ground, our strong foundation laid<br />
          The classroom walls hold all the wisdom we pursue<br />
          With our teachers gentle guidance, honest, strong and truth<br />
          Discipline and respect are the values we hold so dear<br />
          You&apos;ve got the power, you&apos;ve got the might<br />
          Believe in yourself, shine with all your light (2x)
        </p>

        <p className="text-lg sm:text-xl leading-8 mt-6">
          <strong>Chorus</strong><br />
          We sing your praise, our future&apos;s light<br />
          Ayiti Basic School, we&apos;ll make you proud<br />
          Our excellence will shine forever loud<br />
          The school is ours, a spirit so divine (2x)
        </p>

        <p className="mt-6 text-sm text-gray-600">
          Composed by <em>Miss Fumador Gertrude Deladem</em>.
        </p>
      </div>

      <div className="mt-8">
        <audio ref={audioRef} controls src="/anthem.mp3" className="w-full" />
      </div>

      <style jsx>{`
        .eqbar { animation: bounce 0.6s infinite ease-in-out alternate; }
        @keyframes bounce {
          from { transform: scaleY(0.6); opacity: 0.9; }
          to   { transform: scaleY(1.4); opacity: 1; }
        }
      `}</style>
    </main>
  );
}

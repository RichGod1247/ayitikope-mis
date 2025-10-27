// src/app/about/anthem/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/** LYRICS (line-by-line) */
const LYRICS = [
  "We stand as one, united we stand",
  "Ayitikope Basic School, our noble land",
  "Upon this ground, our strong foundation laid",
  "The classroom walls hold all the wisdom we pursue",
  "With our teachers gentle guidance, honest, strong and truth",
  "Discipline and respect are the values we hold so dear",
  "You've got the power, you've got the might",
  "Believe in yourself, shine with all your light",
  "You've got the power, you've got the might",
  "Believe in yourself, shine with all your light",
  "— Chorus —",
  "We sing your praise, our future's light",
  "Ayiti Basic School, we'll make you proud",
  "Our excellence will shine forever loud",
  "The school is ours, a spirit so devine",
  "We sing your praise, our future's light",
  "Ayiti Basic School, we'll make you proud",
  "Our excellence will shine forever loud",
  "The school is ours, a spirit so devine",
];

/** Evenly spread highlighting across duration (simple karaoke) */
function useKaraokeIndex(audio: HTMLAudioElement | null, totalLines: number) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!audio) return;
    let raf = 0;
    const update = () => {
      if (audio.duration && isFinite(audio.duration)) {
        const ratio = Math.min(audio.currentTime / audio.duration, 0.999999);
        setIdx(Math.floor(ratio * totalLines));
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [audio, totalLines]);
  return idx;
}

/** Smaller equalizer: reduce canvas height and keep bars modest */
function useAudioVisualizer(audio: HTMLAudioElement | null, canvas: HTMLCanvasElement | null) {
  useEffect(() => {
    if (!audio || !canvas) return;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let raf = 0;

    const start = () => {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source = audioCtx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx || !analyser) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const barCount = 36; // fewer bars -> subtler look

      const draw = () => {
        if (!analyser || !ctx) return;
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        analyser.getByteFrequencyData(dataArray);
        const step = Math.floor(bufferLength / barCount);
        const barWidth = width / barCount;

        for (let i = 0; i < barCount; i++) {
          const v = dataArray[i * step] / 255;
          const barHeight = v * (height * 0.9);
          const x = i * barWidth + 1;
          const y = height - barHeight;
          ctx.fillStyle = "#1f6fff";
          ctx.fillRect(x, y, barWidth - 2, barHeight);
        }
        raf = requestAnimationFrame(draw);
      };
      draw();
    };

    const onPlay = () => start();
    const onStop = () => { if (raf) cancelAnimationFrame(raf); };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onStop);
    audio.addEventListener("ended", onStop);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onStop);
      audio.removeEventListener("ended", onStop);
      if (raf) cancelAnimationFrame(raf);
      try { source?.disconnect(); analyser?.disconnect(); audioCtx?.close(); } catch {}
    };
  }, [audio, canvas]);
}

export default function AnthemPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const currentIdx = useKaraokeIndex(audioRef.current, LYRICS.length);
  useAudioVisualizer(audioRef.current, canvasRef.current);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLDivElement>(`[data-line="${currentIdx}"]`);
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIdx]);

  return (
    <section className="container mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-800">School Anthem</h1>
        <p className="text-gray-700 text-lg">Ayitikope M/A Basic School</p>
      </header>

      {/* Composer credit (bigger photo) */}
      <div className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm mb-6">
        <div className="w-20 h-20 rounded-full overflow-hidden border shrink-0">
          <Image
            src="/media/composer-gertrude.jpg"
            alt="Miss. Fumador Gertrude Deladem"
            width={120}
            height={120}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-base">
          <div className="font-semibold text-blue-800">Miss. Fumador Gertrude Deladem</div>
          <div className="text-gray-600">Composer</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] items-start">
        {/* Player + (smaller) visualizer */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <audio ref={audioRef} controls className="w-full" src="/media/anthem.m4a" />
          <div className="mt-3">
            <canvas
              ref={canvasRef}
              width={800}
              height={90}                      // ↓ smaller canvas height
              className="w-full h-[90px] rounded-lg bg-[#e9f0ff] border"
            />
          </div>
          <p className="mt-2 text-xs text-gray-600">Bars animate while the song plays.</p>
        </div>

        {/* Karaoke lyrics (bigger font) */}
        <div
          ref={listRef}
          className="rounded-2xl border bg-white p-4 shadow-sm max-h-[360px] overflow-y-auto text-lg sm:text-xl"
        >
          {LYRICS.map((line, i) => {
            const isActive = i === currentIdx;
            const isChorus = line.startsWith("— Chorus —");
            return (
              <div
                key={i}
                data-line={i}
                className={[
                  "px-2 py-1 rounded-md",
                  isChorus ? "mt-2 mb-1 text-sm sm:text-base uppercase tracking-wide text-gray-500" : "",
                  isActive && !isChorus
                    ? "bg-blue-50 border-l-4 border-blue-600 text-blue-800 font-semibold"
                    : "text-gray-900"
                ].join(" ")}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

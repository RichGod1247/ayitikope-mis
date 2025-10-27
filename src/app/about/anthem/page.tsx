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

export default function AnthemPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Web Audio bits we keep in refs so we can create/cleanup safely.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);

  const [activeLine, setActiveLine] = useState(0);

  /** Ensure AudioContext exists and is resumed after user gesture */
  const ensureAudioContext = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      try {
        await audioCtxRef.current.resume();
      } catch {
        /* ignore */
      }
    }
    return audioCtxRef.current;
  };

  /** Start or restart the visualizer + karaoke loop */
  const startVisualizer = async () => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    const ctx = await ensureAudioContext();
    if (!ctx) return;

    // Create nodes once
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
    }
    if (!sourceRef.current) {
      // Connect the HTMLAudioElement to analyser -> destination
      sourceRef.current = ctx.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
    }

    const cnv = canvas.getContext("2d");
    if (!cnv) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 36; // subtle
    const step = Math.floor(bufferLength / barCount);

    const draw = () => {
      // Stop drawing if audio paused/ended to save CPU
      if (audio.paused || audio.ended) return;

      // --- Visualizer ---
      const width = canvas.width;
      const height = canvas.height;
      cnv.clearRect(0, 0, width, height);
      analyser.getByteFrequencyData(dataArray);
      const barWidth = width / barCount;

      for (let i = 0; i < barCount; i++) {
        const v = dataArray[i * step] / 255;
        const barHeight = v * (height * 0.9);
        const x = i * barWidth + 1;
        const y = height - barHeight;
        cnv.fillStyle = "#1f6fff";
        cnv.fillRect(x, y, barWidth - 2, barHeight);
      }

      // --- Karaoke highlighting ---
      if (audio.duration && isFinite(audio.duration)) {
        const ratio = Math.min(audio.currentTime / audio.duration, 0.999999);
        const idx = Math.floor(ratio * LYRICS.length);
        if (idx !== activeLine) setActiveLine(idx);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    // Kick the loop if playing
    if (!audio.paused && !audio.ended) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    }
  };

  /** Attach listeners once refs are ready */
  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    // Ensure canvas has proper pixel size (prevents blurry canvas on some devices)
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * (window.devicePixelRatio || 1));
      canvas.height = Math.floor(90 * (window.devicePixelRatio || 1)); // keep your small height
    };
    resize();
    window.addEventListener("resize", resize);

    // Start visualizer when user presses play
    const onPlay = async () => {
      await ensureAudioContext();
      // resume context on iOS/Android after gesture
      await audioCtxRef.current?.resume();
      startVisualizer();
    };
    const onPauseOrEnd = () => {
      cancelAnimationFrame(rafRef.current);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPauseOrEnd);
    audio.addEventListener("ended", onPauseOrEnd);

    // Some browsers need a one-time user gesture to unlock audio
    const unlock = async () => {
      await ensureAudioContext();
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    };
    document.addEventListener("click", unlock, { once: true, passive: true });
    document.addEventListener("touchstart", unlock, { once: true, passive: true });

    // Pause RAF when tab is hidden
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(rafRef.current);
      else if (!audio.paused) startVisualizer();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", resize);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPauseOrEnd);
      audio.removeEventListener("ended", onPauseOrEnd);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(rafRef.current);
      try {
        sourceRef.current?.disconnect();
        analyserRef.current?.disconnect();
        audioCtxRef.current?.close();
      } catch {}
      sourceRef.current = null;
      analyserRef.current = null;
      audioCtxRef.current = null;
    };
  }, []);

  // Auto-scroll active line into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLDivElement>(`[data-line="${activeLine}"]`);
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeLine]);

  return (
    <section className="container mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-800">School Anthem</h1>
        <p className="text-gray-700 text-lg">Ayitikope M/A Basic School</p>
      </header>

      {/* Composer credit */}
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
        {/* Player + (small) visualizer */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <audio ref={audioRef} controls className="w-full" src="/media/anthem.m4a" />
          <div className="mt-3">
            <canvas
              ref={canvasRef}
              className="w-full h-[90px] rounded-lg bg-[#e9f0ff] border"
              // width/height set dynamically for crisp rendering
            />
          </div>
          <p className="mt-2 text-xs text-gray-600">Bars animate while the song plays.</p>
        </div>

        {/* Karaoke lyrics */}
        <div
          ref={listRef}
          className="rounded-2xl border bg-white p-4 shadow-sm max-h-[360px] overflow-y-auto text-lg sm:text-xl"
        >
          {LYRICS.map((line, i) => {
            const isActive = i === activeLine;
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

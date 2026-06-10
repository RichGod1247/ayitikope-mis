//src/components/attendance/QrCameraScanner.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

type BrowserQRCodeReaderType =
  typeof import("@zxing/browser").BrowserQRCodeReader;

function cleanPayload(value: unknown) {
  return String(value ?? "").trim();
}

function looksLikeEduLifeAttendancePayload(value: string) {
  return value.startsWith("EDULIFEOS-ATT-V1:") && value.length >= 24;
}

function errorMessage(e: unknown) {
  if (e instanceof Error && e.message) return e.message;
  return "Camera scanner could not read the QR code.";
}

export default function QrCameraScanner({
  disabled,
  disabledReason,
  scanBusy,
  onPayload,
}: {
  disabled: boolean;
  disabledReason?: string | null;
  scanBusy?: boolean;
  onPayload: (payload: string) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const disabledRef = useRef(disabled);
  const busyRef = useRef(Boolean(scanBusy));
  const submittingRef = useRef(false);
  const onPayloadRef = useRef(onPayload);

  const lastPayloadRef = useRef("");
  const lastPayloadAtRef = useRef(0);

  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    busyRef.current = Boolean(scanBusy);
  }, [scanBusy]);

  useEffect(() => {
    onPayloadRef.current = onPayload;
  }, [onPayload]);

  const stopCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // no-op
    }

    controlsRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    submittingRef.current = false;
    setActive(false);
    setStarting(false);
  }, []);

  async function loadScanner(): Promise<BrowserQRCodeReaderType> {
    const mod = await import("@zxing/browser");
    return mod.BrowserQRCodeReader;
  }

  async function startCamera() {
    setErr(null);
    setMsg(null);

    if (disabled) {
      setErr(disabledReason || "Camera scanning is disabled for this session.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErr(
        "Camera access is not available in this browser. Use the paste/keyboard scanner box.",
      );
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setErr("Camera preview is not ready.");
      return;
    }

    setStarting(true);

    try {
      setMsg("Loading camera scanner…");

      const BrowserQRCodeReader = await loadScanner();
      const reader = new BrowserQRCodeReader();

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 960 },
            height: { ideal: 540 },
          },
        },
        video,
        async (result) => {
          if (
            !result ||
            disabledRef.current ||
            busyRef.current ||
            submittingRef.current
          ) {
            return;
          }

          const raw = cleanPayload(result.getText());
          if (!raw) return;

          const now = Date.now();
          const recentlySeenSame =
            raw === lastPayloadRef.current &&
            now - lastPayloadAtRef.current < 2500;

          if (recentlySeenSame) return;

          lastPayloadRef.current = raw;
          lastPayloadAtRef.current = now;

          if (!looksLikeEduLifeAttendancePayload(raw)) {
            setMsg(
              "A QR code was seen, but it is not an EduLife attendance badge.",
            );
            return;
          }

          submittingRef.current = true;
          setMsg("EduLife badge detected. Marking attendance…");

          try {
            await onPayloadRef.current(raw);
          } catch (e) {
            setErr(errorMessage(e));
          } finally {
            window.setTimeout(() => {
              submittingRef.current = false;
            }, 900);
          }
        },
      );

      controlsRef.current = controls;
      setActive(true);
      setMsg(
        "Camera scanner is active. Point the camera at an EduLife attendance badge.",
      );
    } catch (e) {
      stopCamera();
      setErr(
        `${errorMessage(e)} If this is a phone, open the deployed HTTPS site, not localhost.`,
      );
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (disabled && active) {
      stopCamera();
    }
  }, [active, disabled, stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-[#07111F]/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-[#F7F4ED]">
            Camera scanner
          </div>
          <p className="mt-1 text-[11px] leading-5 text-[#AEB6C4]">
            Uses the browser camera on supported phones and laptops.
            Paste/keyboard scanner remains the fallback.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!active ? (
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={disabled || starting}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                disabled
                  ? disabledReason || "Camera scanning disabled"
                  : "Start camera scanner"
              }
            >
              {starting ? "Starting…" : "Start camera scan"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-white/10"
            >
              Stop camera
            </button>
          )}
        </div>
      </div>

      <video
        ref={videoRef}
        className={
          active || starting
            ? "mt-4 aspect-video w-full rounded-2xl border border-white/10 bg-black object-cover"
            : "hidden"
        }
        autoPlay
        muted
        playsInline
      />

      {disabled && disabledReason ? (
        <p className="mt-3 text-[11px] text-[#AEB6C4]">
          <span className="font-semibold text-[#F7F4ED]">Camera disabled:</span>{" "}
          {disabledReason}
        </p>
      ) : null}

      {scanBusy ? (
        <p className="mt-3 text-[11px] text-[#E8C96A]">Submitting QR scan…</p>
      ) : null}

      {msg ? <p className="mt-3 text-[11px] text-emerald-100">{msg}</p> : null}
      {err ? <p className="mt-3 text-[11px] text-rose-100">{err}</p> : null}
    </div>
  );
}

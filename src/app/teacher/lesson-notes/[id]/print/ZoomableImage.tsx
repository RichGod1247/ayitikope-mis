// src/app/teacher/lesson-notes/[id]/print/ZoomableImage.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Props = {
  src: string;
  alt: string;
  heightClassName: string; // e.g. "h-[240px] sm:h-[320px] md:h-[380px] lg:h-[420px]"
};

type Point = { x: number; y: number };

function dist(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function ZoomableImage({ src, alt, heightClassName }: Props) {
  const [open, setOpen] = useState(false);

  const minScale = 1;
  const maxScale = 4;

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const pointersRef = useRef<Map<number, Point>>(new Map());
  const dragRef = useRef<{ active: boolean; start: Point; startT: Point }>({
    active: false,
    start: { x: 0, y: 0 },
    startT: { x: 0, y: 0 },
  });

  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startScale: number;
    startCenter: Point;
    startT: Point;
  }>({
    active: false,
    startDist: 0,
    startScale: 1,
    startCenter: { x: 0, y: 0 },
    startT: { x: 0, y: 0 },
  });

  const canPan = scale > 1.001;

  const overlayTitle = useMemo(() => {
    const base = (alt || "Indicator illustration").trim();
    return base.length > 96 ? base.slice(0, 96).trimEnd() + "…" : base;
  }, [alt]);

  function reset() {
    setScale(1);
    setTx(0);
    setTy(0);
    dragRef.current.active = false;
    pinchRef.current.active = false;
    pointersRef.current.clear();
  }

  function zoomIn() {
    setScale((s) => clamp(Number((s + 0.25).toFixed(2)), minScale, maxScale));
  }

  function zoomOut() {
    setScale((s) => {
      const next = clamp(Number((s - 0.25).toFixed(2)), minScale, maxScale);
      if (next <= 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  }

  // ESC closes; Ctrl/⌘ +/−/0 for desktop polish
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);

      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        zoomIn();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        zoomOut();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "0") {
        e.preventDefault();
        reset();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Prevent background scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function blockContextMenu(e: React.MouseEvent) {
    e.preventDefault();
  }

  function onWheel(e: React.WheelEvent) {
    if (!open) return;
    e.preventDefault();

    const delta = e.deltaY;
    if (delta < 0) setScale((s) => clamp(Number((s + 0.12).toFixed(2)), minScale, maxScale));
    else
      setScale((s) => {
        const next = clamp(Number((s - 0.12).toFixed(2)), minScale, maxScale);
        if (next <= 1) {
          setTx(0);
          setTy(0);
        }
        return next;
      });
  }

  function startPinchIfReady() {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length !== 2) return;

    const [p1, p2] = pts;
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    pinchRef.current.active = true;
    pinchRef.current.startDist = Math.max(1, dist(p1, p2));
    pinchRef.current.startScale = scale;
    pinchRef.current.startCenter = center;
    pinchRef.current.startT = { x: tx, y: ty };

    dragRef.current.active = false;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!open) return;

    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two-finger gesture => pinch
    if (pointersRef.current.size === 2) {
      startPinchIfReady();
      return;
    }

    // One-finger drag (pan) when zoomed
    if (pointersRef.current.size === 1 && canPan) {
      dragRef.current.active = true;
      dragRef.current.start = { x: e.clientX, y: e.clientY };
      dragRef.current.startT = { x: tx, y: ty };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!open) return;

    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-to-zoom (true 2-finger)
    if (pinchRef.current.active && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const [p1, p2] = pts;

      const d = Math.max(1, dist(p1, p2));
      const ratio = d / Math.max(1, pinchRef.current.startDist);
      const nextScale = clamp(Number((pinchRef.current.startScale * ratio).toFixed(3)), minScale, maxScale);

      // Also allow 2-finger pan by moving pinch center
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const dx = center.x - pinchRef.current.startCenter.x;
      const dy = center.y - pinchRef.current.startCenter.y;

      setScale(nextScale);

      if (nextScale <= 1.001) {
        setTx(0);
        setTy(0);
      } else {
        setTx(pinchRef.current.startT.x + dx);
        setTy(pinchRef.current.startT.y + dy);
      }

      return;
    }

    // One-finger pan
    if (dragRef.current.active && pointersRef.current.size === 1 && canPan) {
      const dx = e.clientX - dragRef.current.start.x;
      const dy = e.clientY - dragRef.current.start.y;
      setTx(dragRef.current.startT.x + dx);
      setTy(dragRef.current.startT.y + dy);
    }
  }

  function endGesture(pointerId: number, el: HTMLElement, e: React.PointerEvent) {
    try {
      el.releasePointerCapture?.(pointerId);
    } catch {}

    pointersRef.current.delete(pointerId);

    if (pointersRef.current.size < 2) {
      pinchRef.current.active = false;
    }
    if (pointersRef.current.size === 0) {
      dragRef.current.active = false;
    }

    // snap back if scale is basically 1
    if (scale <= 1.001) {
      setScale(1);
      setTx(0);
      setTy(0);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!open) return;
    endGesture(e.pointerId, e.currentTarget as HTMLElement, e);
  }

  function onPointerCancel(e: React.PointerEvent) {
    if (!open) return;
    endGesture(e.pointerId, e.currentTarget as HTMLElement, e);
  }

  return (
    <div className="w-full">
      {/* SCREEN: click/tap to open zoom viewer */}
      <button
        type="button"
        className="print:hidden w-full text-left"
        onClick={() => {
          setOpen(true);
          reset();
        }}
        title="Tap to zoom"
      >
        <div className="w-full overflow-hidden border border-zinc-200 bg-white">
          <div className={`w-full ${heightClassName}`}>
            <img
              src={src}
              alt={alt}
              className="block w-full h-full object-cover sm:object-contain"
              loading="lazy"
              draggable={false}
              onContextMenu={blockContextMenu}
            />
          </div>
        </div>
        <div className="mt-1 text-[10px] text-zinc-600">
          Tap/click image to zoom (pinch supported).
        </div>
      </button>

      {/* PRINT: static image (no cropping surprises) */}
      <div className="hidden print:block w-full overflow-hidden border border-zinc-200 bg-white">
        <img src={src} alt={alt} className="block w-full h-auto object-contain" />
      </div>

      {/* Overlay viewer */}
      {open ? (
        <div
          className="print:hidden fixed inset-0 z-[90] bg-black/70"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Image zoom viewer"
        >
          <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
            <div
              className="w-full max-w-5xl rounded-2xl bg-white shadow-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b px-3 py-2 sm:px-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 truncate">{overlayTitle}</div>
                  <div className="text-[11px] text-zinc-600">
                    Zoom: <span className="font-semibold">{Math.round(scale * 100)}%</span>
                    {canPan ? <span> • Drag to pan</span> : <span> • Pinch/zoom to pan</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
                    onClick={zoomOut}
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
                    onClick={zoomIn}
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
                    onClick={reset}
                    aria-label="Reset zoom"
                    title="Reset"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
                    onClick={() => setOpen(false)}
                    aria-label="Close viewer"
                    title="Close (Esc)"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Canvas (pinch + pan) */}
              <div
                className="relative h-[65vh] w-full bg-zinc-950/5 overflow-hidden touch-none"
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    src={src}
                    alt={alt}
                    draggable={false}
                    onContextMenu={blockContextMenu}
                    className="max-h-full max-w-full select-none"
                    style={{
                      transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                      transformOrigin: "center center",
                      cursor: canPan ? "grab" : "zoom-in",
                    }}
                  />
                </div>
              </div>

              <div className="border-t px-3 py-2 sm:px-4 text-[11px] text-zinc-600">
                Mobile: pinch to zoom, drag to pan. Desktop: wheel to zoom. No download button.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
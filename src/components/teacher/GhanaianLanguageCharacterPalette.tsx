"use client";

import { useEffect, useMemo, useState } from "react";
import { getGhanaianLanguage } from "@/lib/ghanaianLanguages/registry";

export default function GhanaianLanguageCharacterPalette(props: {
  languageCode: string;
  disabled?: boolean;
  mobileActive?: boolean;
  desktopCompact?: boolean;
  onInsert: (character: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [mobileBottom, setMobileBottom] = useState(6);
  const language = useMemo(() => getGhanaianLanguage(props.languageCode), [props.languageCode]);

  useEffect(() => {
    function syncMobileBottom() {
      const viewport = window.visualViewport;
      if (!viewport) {
        setMobileBottom(6);
        return;
      }

      const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setMobileBottom(keyboardInset + 6);
    }

    syncMobileBottom();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncMobileBottom);
    viewport?.addEventListener("scroll", syncMobileBottom);
    window.addEventListener("resize", syncMobileBottom);

    return () => {
      viewport?.removeEventListener("resize", syncMobileBottom);
      viewport?.removeEventListener("scroll", syncMobileBottom);
      window.removeEventListener("resize", syncMobileBottom);
    };
  }, []);

  if (!language || language.keyboardCharacters.length === 0) return null;

  const characterButtons = (compact = false) =>
    language.keyboardCharacters.map((character) => (
      <button
        key={character}
        type="button"
        className={
          compact
            ? "min-h-10 min-w-10 shrink-0 rounded-lg border border-white/15 bg-[#07111F] px-2.5 py-1.5 text-lg font-semibold text-white active:bg-[#12345B] disabled:opacity-60"
            : "min-h-10 min-w-10 rounded-xl border border-white/15 bg-[#07111F] px-3 py-2 text-lg font-semibold text-white hover:bg-[#0B1D34] disabled:opacity-60"
        }
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => props.onInsert(character)}
        disabled={props.disabled}
        aria-label={`Insert ${character}`}
      >
        {character}
      </button>
    ));

  return (
    <>
      <div className="hidden md:block">
        {props.desktopCompact ? (
          open ? (
            <div
              className="w-fit max-w-full rounded-xl border border-sky-300/20 bg-[#071A3D]/95 p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl"
              role="group"
              aria-label={`${language.name} sticky special letters`}
            >
              <div className="flex max-w-full flex-wrap gap-1.5">
                {characterButtons()}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-sky-200/20 bg-[#071A3D]/95 px-3 py-2 text-xs font-semibold text-sky-50 shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl disabled:opacity-60"
              onClick={() => setOpen(true)}
              disabled={props.disabled}
              aria-expanded={false}
            >
              {language.name} letters · Aa
            </button>
          )
        ) : (
          <div className="rounded-2xl border border-sky-300/20 bg-[#071A3D]/95 p-3 text-sky-50 shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.08em]">{language.name} letters</div>
                <div className="mt-0.5 text-[11px] leading-4 text-sky-100/80">
                  Tap a special letter to insert it where you last placed the cursor. The letters stay with you while you scroll.
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-sky-200/20 bg-sky-100/10 px-3 py-2 text-xs font-semibold hover:bg-sky-100/15 disabled:opacity-60"
                onClick={() => setOpen((current) => !current)}
                disabled={props.disabled}
                aria-expanded={open}
              >
                {open ? "Hide letters" : `${language.name} letters · Aa`}
              </button>
            </div>

            {open ? (
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`${language.name} special letters`}>
                {characterButtons()}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {props.mobileActive ? (
        <div
          className="fixed inset-x-1.5 z-[65] md:hidden"
          style={{ bottom: `${mobileBottom}px` }}
          aria-label={`${language.name} keyboard accessory`}
        >
          <div className="rounded-xl border border-sky-200/25 bg-[#071A3D]/98 p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.36)] backdrop-blur-xl">
            <span className="sr-only">{language.name} special letters</span>
            <div
              className="flex gap-1.5 overflow-x-auto overscroll-x-contain"
              role="group"
              aria-label={`${language.name} mobile special letters`}
            >
              {characterButtons(true)}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

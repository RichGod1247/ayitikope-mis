"use client";

import { useEffect, useRef, useState } from "react";

type Welcome = {
  id: string;
  title: string;
  body: string;
  roleLabel: string;
  schoolName: string;
  messageVersion: string;
  seen: boolean;
};

async function recordAction(welcomeId: string, action: "SEEN" | "DISMISS") {
  const response = await fetch("/api/teacher/onboarding-welcome", {
    method: "PATCH",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ welcomeId, action }),
  });

  return response.ok;
}

export default function StaffOnboardingWelcomeCard({ welcome }: { welcome: Welcome }) {
  const [visible, setVisible] = useState(true);
  const [dismissing, setDismissing] = useState(false);
  const seenStarted = useRef(false);

  useEffect(() => {
    if (welcome.seen || seenStarted.current) return;
    seenStarted.current = true;
    void recordAction(welcome.id, "SEEN");
  }, [welcome.id, welcome.seen]);

  if (!visible) return null;

  async function dismiss() {
    if (dismissing) return;
    setDismissing(true);
    const ok = await recordAction(welcome.id, "DISMISS");
    if (ok) setVisible(false);
    setDismissing(false);
  }

  return (
    <section
      data-staff-onboarding-welcome="v1"
      aria-label="EduLife OS onboarding welcome"
      className="mb-4 rounded-2xl border border-[#E8C96A]/25 bg-[linear-gradient(135deg,rgba(27,102,209,0.16),rgba(212,175,55,0.08))] p-4 shadow-[0_14px_45px_rgba(0,0,0,0.16)] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
            EduLife OS · Welcome
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[#F7F4ED]">{welcome.title}</h2>
          <p className="mt-1.5 text-sm leading-6 text-[#D5DAE3]">{welcome.body}</p>
        </div>

        <button
          type="button"
          onClick={dismiss}
          disabled={dismissing}
          className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-[#F7F4ED] transition hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
        >
          {dismissing ? "Saving…" : "Got it"}
        </button>
      </div>
    </section>
  );
}

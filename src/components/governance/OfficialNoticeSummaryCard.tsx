"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type NoticeSummary = {
  total: number;
  unread: number;
  unacknowledged: number;
  acknowledged: number;
  latest: Array<{
    id: string;
    readAt: string | null;
    acknowledgedAt: string | null;
    createdAt: string;
    notice: {
      id: string;
      title: string;
      priority: string;
      status: string;
      sentAt: string | null;
      createdAt: string;
      sender: { id: string; name: string | null; email: string } | null;
      tenant: { id: string; name: string; schoolCode: string | null } | null;
      zone: {
        id: string;
        name: string;
        zoneType: { name: string; level: number } | null;
      } | null;
    };
  }>;
  appraisal?: {
    total: number;
    unread: number;
    latest: {
      id: string;
      title: string;
      sentAt: string | null;
      createdAt: string;
    } | null;
  };
};

type SummaryResponse =
  | { ok: true; summary: NoticeSummary }
  | { ok: false; error: string };

type Props = {
  href: string;
  portalLabel: string;
  variant?: "card" | "icon";
  className?: string;
};

function dateLabel(value: string | null) {
  if (!value) return "Not yet";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Accra",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function safeTime(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function OfficialNoticeSummaryCard({
  href,
  portalLabel,
  variant = "card",
  className = "",
}: Props) {
  const [summary, setSummary] = useState<NoticeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastRefreshAt = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/governance/notices/summary", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as SummaryResponse | null;

      if (!res.ok || !json?.ok) {
        setSummary(null);
        setError(
          json && "error" in json
            ? json.error
            : `Failed to load notice summary (${res.status})`,
        );
        return;
      }

      setSummary(json.summary);
    } catch {
      setSummary(null);
      setError("Network/server error while loading notice summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const refreshWhenActive = () => {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastRefreshAt.current < 750) return;
      lastRefreshAt.current = now;
      void load();
    };

    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("focus", refreshWhenActive);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("focus", refreshWhenActive);
    };
  }, [load]);

  const unacknowledged = summary?.unacknowledged ?? 0;
  const officialUnread = summary?.unread ?? 0;
  const appraisalUnread = summary?.appraisal?.unread ?? 0;
  const unread = officialUnread + appraisalUnread;
  const officialTotal = summary?.total ?? 0;
  const appraisalTotal = summary?.appraisal?.total ?? 0;
  const combinedTotal = officialTotal + appraisalTotal;
  const latestOfficial = summary?.latest?.[0] ?? null;
  const latestAppraisal = summary?.appraisal?.latest ?? null;

  const officialLatestAt = safeTime(
    latestOfficial?.notice.sentAt ?? latestOfficial?.notice.createdAt,
  );
  const appraisalLatestAt = safeTime(
    latestAppraisal?.sentAt ?? latestAppraisal?.createdAt,
  );
  const latestTitle =
    appraisalLatestAt > officialLatestAt
      ? latestAppraisal?.title ?? null
      : latestOfficial?.notice.title ?? latestAppraisal?.title ?? null;
  const latestAt =
    appraisalLatestAt > officialLatestAt
      ? latestAppraisal?.sentAt ?? latestAppraisal?.createdAt ?? null
      : latestOfficial?.notice.sentAt ??
        latestOfficial?.notice.createdAt ??
        latestAppraisal?.sentAt ??
        latestAppraisal?.createdAt ??
        null;

  if (variant === "icon") {
    const badgeCount = unread;
    const urgent = unacknowledged > 0;

    return (
      <Link
        href={href}
        className={`group relative inline-flex min-h-11 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-left shadow-[0_12px_36px_rgba(0,0,0,0.16)] transition hover:border-violet-300/35 hover:bg-white/10 ${className}`}
        aria-label={`${portalLabel} notices${badgeCount ? `, ${badgeCount} unread` : ""}`}
        title={
          latestTitle
            ? `Latest notice: ${latestTitle}`
            : loading
              ? "Loading notices"
              : error
                ? "Notices unavailable"
                : "No unread notices"
        }
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-400/12 text-lg text-violet-100">
          ✉
        </span>

        <span className="hidden sm:block">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-100">
            Notices
          </span>
          <span className="block text-xs text-[#C9CDD6]">
            {loading
              ? "Checking…"
              : error
                ? "Unavailable"
                : badgeCount
                  ? `${badgeCount} unread`
                  : "All read"}
          </span>
        </span>

        {badgeCount > 0 ? (
          <span
            className={`absolute -right-2 -top-2 inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
              urgent
                ? "border-red-200/50 bg-red-500 text-white"
                : "border-amber-200/50 bg-amber-400 text-[#071A3D]"
            }`}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <section
      className={`rounded-[28px] border border-violet-300/20 bg-[linear-gradient(135deg,rgba(22,17,46,0.88),rgba(33,26,68,0.78),rgba(12,19,32,0.92))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.20)] ${className}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
            Notices · {portalLabel}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Accountability inbox
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
            Review official governance notices and personal appraisal messages that require your attention.
          </p>

          {latestTitle ? (
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Latest: <span className="text-slate-100">{latestTitle}</span>{" "}
              · Sent {dateLabel(latestAt)}
            </p>
          ) : !loading && !error ? (
            <p className="mt-3 text-xs text-slate-400">No notices yet.</p>
          ) : null}

          {error ? <p className="mt-3 text-xs text-red-200">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
            Total: <b className="text-white">{combinedTotal}</b>
          </span>
          <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
            Unread: <b>{unread}</b>
          </span>
          <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-xs text-red-100">
            Unacknowledged: <b>{unacknowledged}</b>
          </span>
          {appraisalTotal > 0 ? (
            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
              Appraisal messages: <b>{appraisalTotal}</b>
            </span>
          ) : null}
          <Link
            href={href}
            className="rounded-full border border-violet-300/30 bg-violet-400/12 px-4 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/18"
          >
            {loading ? "Loading..." : "Open notices"}
          </Link>
        </div>
      </div>
    </section>
  );
}

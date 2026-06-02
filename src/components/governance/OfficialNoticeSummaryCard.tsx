// src/components/governance/OfficialNoticeSummaryCard.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
};

type SummaryResponse =
  | { ok: true; summary: NoticeSummary }
  | { ok: false; error: string };

type Props = {
  href: string;
  portalLabel: string;
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

export default function OfficialNoticeSummaryCard({ href, portalLabel }: Props) {
  const [summary, setSummary] = useState<NoticeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        setError(json && !json.ok ? json.error : `Failed to load notice summary (${res.status})`);
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
  }, [load]);

  const unacknowledged = summary?.unacknowledged ?? 0;
  const unread = summary?.unread ?? 0;
  const latest = summary?.latest?.[0] ?? null;

  return (
    <section className="rounded-[28px] border border-violet-300/20 bg-[linear-gradient(135deg,rgba(22,17,46,0.88),rgba(33,26,68,0.78),rgba(12,19,32,0.92))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.20)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
            Official Notices · {portalLabel}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Accountability inbox
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
            Track official instructions that require your attention, reading, and acknowledgement.
          </p>

          {latest ? (
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Latest: <span className="text-slate-100">{latest.notice.title}</span>{" "}
              · Sent {dateLabel(latest.notice.sentAt ?? latest.notice.createdAt)}
            </p>
          ) : !loading && !error ? (
            <p className="mt-3 text-xs text-slate-400">No official notices yet.</p>
          ) : null}

          {error ? <p className="mt-3 text-xs text-red-200">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
            Total: <b className="text-white">{summary?.total ?? 0}</b>
          </span>
          <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
            Unread: <b>{unread}</b>
          </span>
          <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-xs text-red-100">
            Unacknowledged: <b>{unacknowledged}</b>
          </span>
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
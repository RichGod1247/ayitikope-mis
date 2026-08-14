"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type AppraisalMessage = {
  id: string;
  title: string;
  message: string;
  href: string | null;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

type InboxResponse =
  | {
      ok: true;
      items: AppraisalMessage[];
      count: number;
      unread: number;
    }
  | {
      ok: false;
      error: string;
    };

type MarkReadResponse =
  | {
      ok: true;
      result: {
        outcome: "MARKED_READ" | "ALREADY_READ";
        readAt: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

function cleanDate(value: string | null) {
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

export default function HeadteacherAppraisalMessageInbox() {
  const [items, setItems] = useState<AppraisalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/headteacher/appraisal-notifications?take=20",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );

      const json = (await response.json().catch(() => null)) as InboxResponse | null;

      if (!response.ok || !json?.ok) {
        setItems([]);
        setError(
          json && !json.ok
            ? json.error
            : `Failed to load appraisal messages (${response.status})`,
        );
        return;
      }

      setItems(json.items ?? []);
    } catch {
      setItems([]);
      setError("Network/server error while loading appraisal messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(item: AppraisalMessage) {
    setBusyId(item.id);
    setError(null);

    try {
      const response = await fetch("/api/headteacher/appraisal-notifications", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notificationId: item.id }),
      });

      const json = (await response.json().catch(() => null)) as
        | MarkReadResponse
        | null;

      if (!response.ok || !json?.ok) {
        setError(
          json && !json.ok
            ? json.error
            : `Failed to mark appraisal message as read (${response.status})`,
        );
        return;
      }

      await load();
    } catch {
      setError("Network/server error while marking the appraisal message as read.");
    } finally {
      setBusyId(null);
    }
  }

  if (!loading && !error && items.length === 0) return null;

  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <section className="rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(7,27,38,0.94),rgba(10,42,58,0.90),rgba(8,18,28,0.96))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.20)] md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            EduLife OS · Appraisal messages
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">
            Personal leadership messages
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
            Private messages connected to appraisal participation appear here without exposing your confidential answers.
          </p>
        </div>

        {!loading ? (
          <span className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
            {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          Loading appraisal messages…
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const read = Boolean(item.readAt);

          return (
            <article
              key={item.id}
              className={`rounded-[24px] border p-4 ${
                read
                  ? "border-white/10 bg-[#07111F]"
                  : "border-emerald-300/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(7,17,31,0.96))]"
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                      Appreciation
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        read
                          ? "border-white/10 bg-white/5 text-slate-300"
                          : "border-amber-300/25 bg-amber-400/10 text-amber-100"
                      }`}
                    >
                      {read ? "READ" : "UNREAD"}
                    </span>
                    <span className="rounded-full border border-slate-300/20 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                      Information only
                    </span>
                  </div>

                  <h3 className="mt-3 text-xl font-bold leading-snug text-white md:text-2xl">
                    {item.title}
                  </h3>

                  <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.055] p-4">
                    <p className="whitespace-pre-wrap text-base leading-8 text-emerald-50 md:text-lg md:leading-9">
                      {item.message}
                    </p>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    Sent {cleanDate(item.sentAt ?? item.createdAt)}. This message does not reveal your response, score, school, or masked respondent label.
                  </p>
                </div>

                <div className="w-full shrink-0 space-y-2 lg:w-56">
                  <button
                    type="button"
                    onClick={() => void markRead(item)}
                    disabled={read || busyId === item.id}
                    className="min-h-12 w-full rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {read
                      ? "Already read"
                      : busyId === item.id
                        ? "Marking read…"
                        : "Mark as read"}
                  </button>

                  {item.href ? (
                    <Link
                      href={item.href}
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-center text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                    >
                      Open related appraisal
                    </Link>
                  ) : null}

                  {read ? (
                    <p className="text-center text-xs text-slate-500">
                      Read {cleanDate(item.readAt)}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

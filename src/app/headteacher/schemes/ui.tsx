"use client";

import { useEffect, useMemo, useState } from "react";

type SchemeStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";
type StatusFilter = SchemeStatus | "ALL";

type SchemeWorkItem = {
  id: string;
  weekNumber: number;
  strandTitle: string | null;
  subStrandTitle: string | null;
  contentStandardCode: string | null;
  indicatorCode: string | null;
  indicatorDescription: string;
};

type SchemeItem = {
  id: string;
  teacherUserId: string;
  teacherName: string;
  classroomName: string | null;
  subject: string;
  level: string | null;
  term: string;
  academicYear: string;
  status: SchemeStatus;
  itemCount: number;
  schemeItems: SchemeWorkItem[];
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  returnedAt: string | null;
  headteacherComment: string | null;
  updatedAt: string;
};

type MissingTeacher = {
  teacherUserId: string;
  teacherName: string;
  staffId: string | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  summary?: {
    total: number;
    draft: number;
    submitted: number;
    returned: number;
    approved: number;
  };
  items?: SchemeItem[];
  missingTeachers?: MissingTeacher[];
};

const filters: Array<{ key: StatusFilter; label: string }> = [
  { key: "SUBMITTED", label: "Pending Review" },
  { key: "RETURNED", label: "Returned" },
  { key: "APPROVED", label: "Approved" },
  { key: "DRAFT", label: "Draft" },
  { key: "ALL", label: "All" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function statusLabel(status: SchemeStatus) {
  if (status === "SUBMITTED") return "Pending Review";
  if (status === "APPROVED") return "Approved";
  if (status === "RETURNED") return "Returned";
  return "Draft";
}

function statusClass(status: SchemeStatus) {
  if (status === "APPROVED") return "border-emerald-300/25 bg-emerald-400/14 text-emerald-100";
  if (status === "SUBMITTED") return "border-amber-300/25 bg-amber-400/14 text-amber-100";
  if (status === "RETURNED") return "border-rose-300/25 bg-rose-400/14 text-rose-100";
  return "border-white/10 bg-white/10 text-[#C9CDD6]";
}

function formatDateTime(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

const btnBase =
  "inline-flex min-h-11 items-center justify-center rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

const btnPrimary =
  btnBase +
  " border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105";

const btnDanger =
  btnBase + " border-rose-300/20 bg-rose-400/12 text-rose-100 hover:bg-rose-400/18";

export default function HeadteacherSchemesClient() {
  const [status, setStatus] = useState<StatusFilter>("SUBMITTED");
  const [items, setItems] = useState<SchemeItem[]>([]);
  const [missingTeachers, setMissingTeachers] = useState<MissingTeacher[]>([]);
  const [summary, setSummary] = useState<ApiResponse["summary"] | null>(null);

  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const url = `/api/headteacher/schemes?status=${encodeURIComponent(status)}&limit=100`;
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to load schemes.");
        setItems([]);
        setMissingTeachers([]);
        setSummary(null);
        return;
      }

      setItems(data.items ?? []);
      setMissingTeachers(data.missingTeachers ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setError("Network error while loading schemes.");
      setItems([]);
      setMissingTeachers([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const pendingCount = summary?.submitted ?? 0;

  const grouped = useMemo(() => {
    const map = new Map<string, SchemeItem[]>();

    for (const item of items) {
      const key = item.teacherName || "Unknown teacher";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    return Array.from(map.entries()).map(([teacherName, schemes]) => ({
      teacherName,
      schemes: schemes.sort((a, b) => a.subject.localeCompare(b.subject)),
    }));
  }, [items]);

  async function reviewScheme(scheme: SchemeItem, action: "approve" | "return") {
    if (busyId) return;

    const comment = (comments[scheme.id] ?? "").trim();

    if (action === "return" && comment.length < 3) {
      setError("Write a short return comment before returning the scheme.");
      return;
    }

    const ok =
      action === "approve"
        ? window.confirm(
            "Approve this scheme? This confirms you manually checked it against the office-issued scheme.",
          )
        : window.confirm("Return this scheme to the teacher for correction?");

    if (!ok) return;

    setBusyId(scheme.id);
    setError(null);

    try {
      const res = await fetch("/api/headteacher/schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          schemeId: scheme.id,
          action,
          comment,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Failed to review scheme.");
        return;
      }

      setComments((prev) => ({ ...prev, [scheme.id]: "" }));
      await load();
    } catch {
      setError("Network error while reviewing scheme.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:py-8">
        <header className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                EduLife OS · Headteacher
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">
                Scheme of Work Vetting
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
                Review teacher-prepared schemes. Approve only after manually checking against the office-issued scheme shared by the municipal office.
              </p>
            </div>

           <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-amber-50 md:rounded-3xl md:px-5 md:py-4">
  <div className="text-xl font-black leading-none md:text-3xl">{pendingCount}</div>
  <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] md:text-xs md:tracking-wide">
    Pending review
  </div>
</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={cx(
                "min-h-14 rounded-2xl border px-3 py-2 text-sm font-bold transition",
                status === f.key
                  ? "border-[#E8C96A]/40 bg-[#E8C96A]/15 text-[#F7F4ED]"
                  : "border-white/10 bg-white/[0.04] text-[#C9CDD6] hover:bg-white/[0.07]",
              )}
            >
              {f.label}
            </button>
          ))}
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="grid grid-cols-4 gap-1.5 md:gap-3">
  <Metric label="Draft" value={summary?.draft ?? 0} />
  <Metric label="Pending" value={summary?.submitted ?? 0} />
  <Metric label="Returned" value={summary?.returned ?? 0} />
  <Metric label="Approved" value={summary?.approved ?? 0} />
</section>

        {loading && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-[#C9CDD6]">
            Loading schemes…
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-[#C9CDD6]">
            No schemes found for this filter.
          </div>
        )}

        <section className="space-y-4">
          {grouped.map((group) => (
            <div
              key={group.teacherName}
              className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
            >
              <div className="border-b border-white/10 px-4 py-3">
                <h2 className="text-base font-black text-[#F7F4ED]">
                  {group.teacherName}
                </h2>
                <p className="text-xs text-[#AEB6C4]">
                  {group.schemes.length} scheme{group.schemes.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="space-y-3 p-4">
                {group.schemes.map((scheme) => {
                  const isExpanded = !!expanded[scheme.id];
                  return (
                    <article
                      key={scheme.id}
                      className="rounded-3xl border border-white/10 bg-[#08111C]/85 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cx(
                                "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                                statusClass(scheme.status),
                              )}
                            >
                              {statusLabel(scheme.status)}
                            </span>
                            <span className="text-xs text-[#AEB6C4]">
                              {scheme.itemCount} indicator{scheme.itemCount === 1 ? "" : "s"}
                            </span>
                          </div>

                          <h3 className="text-lg font-black text-[#F7F4ED]">
                            {scheme.subject}
                          </h3>

                          <p className="text-sm leading-6 text-[#C9CDD6]">
                            {scheme.level ?? "Level not set"} · {scheme.term} · {scheme.academicYear}
                            {scheme.classroomName ? ` · ${scheme.classroomName}` : ""}
                          </p>

                          <p className="text-xs text-[#8F98A8]">
                            Submitted: {formatDateTime(scheme.submittedAt)} · Reviewed: {formatDateTime(scheme.reviewedAt)}
                          </p>

                          {scheme.headteacherComment && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-6 text-[#C9CDD6]">
                              <span className="font-bold text-[#F7F4ED]">Comment: </span>
                              {scheme.headteacherComment}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [scheme.id]: !prev[scheme.id],
                            }))
                          }
                          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-[#F7F4ED] transition hover:bg-white/10"
                        >
                          {isExpanded ? "Hide Scheme" : "View Scheme"}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                          <div className="border-b border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#E8C96A]">
                            Week-by-week evidence
                          </div>
                          <div className="max-h-96 overflow-auto">
                            {scheme.schemeItems.length === 0 ? (
                              <div className="px-3 py-3 text-xs text-[#AEB6C4]">
                                No indicators added yet.
                              </div>
                            ) : (
                              scheme.schemeItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="border-b border-white/10 px-3 py-3 text-xs last:border-b-0"
                                >
                                  <div className="font-black text-[#F7F4ED]">
                                    Week {item.weekNumber} · {item.indicatorCode || "No code"}
                                  </div>
                                  <div className="mt-1 text-[#C9CDD6]">
                                    {item.indicatorDescription || "No indicator description"}
                                  </div>
                                  <div className="mt-1 text-[#8F98A8]">
                                    {item.strandTitle || "—"} {item.subStrandTitle ? `→ ${item.subStrandTitle}` : ""}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {scheme.status === "SUBMITTED" && (
                        <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <label className="block text-xs font-bold uppercase tracking-wide text-[#E8C96A]">
                            Review comment
                          </label>
                          <textarea
                            value={comments[scheme.id] ?? ""}
                            onChange={(e) =>
                              setComments((prev) => ({
                                ...prev,
                                [scheme.id]: e.target.value,
                              }))
                            }
                            placeholder="Optional for approval. Required when returning."
                            className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#05070B] px-3 py-2 text-sm text-[#F7F4ED] outline-none placeholder:text-[#6F7785] focus:border-[#E8C96A]/45"
                          />

                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => reviewScheme(scheme, "approve")}
                              disabled={busyId === scheme.id}
                              className={btnPrimary}
                            >
                              {busyId === scheme.id ? "Saving…" : "Approve Scheme"}
                            </button>

                            <button
                              type="button"
                              onClick={() => reviewScheme(scheme, "return")}
                              disabled={busyId === scheme.id}
                              className={btnDanger}
                            >
                              Return for Correction
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {missingTeachers.length > 0 && (
          <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-4 text-amber-50">
            <h2 className="text-base font-black">Teachers without schemes yet</h2>
            <p className="mt-1 text-xs leading-6 text-amber-100/85">
              This is a simple V1 warning: these teachers have no scheme record for the current term/year. Later, this will become subject-by-subject scope tracking.
            </p>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {missingTeachers.map((t) => (
                <div
                  key={t.teacherUserId}
                  className="rounded-2xl border border-amber-300/20 bg-black/10 px-3 py-2 text-sm font-semibold"
                >
                  {t.teacherName}
                  {t.staffId ? (
                    <span className="ml-2 text-xs font-normal text-amber-100/75">
                      {t.staffId}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 md:rounded-3xl md:p-4">
      <div className="text-lg font-black leading-none text-[#F7F4ED] md:text-3xl">
        {value}
      </div>
      <div
        title={label}
        className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.06em] text-[#AEB6C4] md:mt-1 md:text-xs md:tracking-wide"
      >
        {label}
      </div>
    </div>
  );
}

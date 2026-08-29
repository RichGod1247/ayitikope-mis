"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import StudentClassSelect from "@/components/admin/StudentClassSelect";
import type { StudentClassroomOption } from "@/lib/studentClassroomPresentation";

function inputClass() {
  return "w-full rounded-lg border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25";
}

function primaryBtnClass() {
  return "rounded-lg border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60";
}

function outlineBtnClass() {
  return "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60";
}

export default function StudentListFilterBar({
  classes,
  initialQuery,
  initialClassroomId,
  showArchived,
}: {
  classes: StudentClassroomOption[];
  initialQuery: string;
  initialClassroomId: string;
  showArchived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [classroomId, setClassroomId] = useState(initialClassroomId);
  const [error, setError] = useState<string | null>(null);

  function navigate(nextQuery: string, nextClassroomId: string) {
    const params = new URLSearchParams();
    params.set("show", showArchived ? "archived" : "active");
    params.set("section", "list");

    const cleanQuery = nextQuery.trim();
    if (cleanQuery) params.set("q", cleanQuery);
    if (!showArchived && nextClassroomId) params.set("classroomId", nextClassroomId);

    startTransition(() => {
      router.push(`/admin/students?${params.toString()}`);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!showArchived && !classroomId) {
      setError("Choose a class first.");
      return;
    }

    setError(null);
    navigate(query, classroomId);
  }

  function clear() {
    setQuery("");
    if (!showArchived) setClassroomId("");
    setError(null);
    navigate("", "");
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto_auto]"
    >
      <div className="min-w-0">
        <label className="sr-only" htmlFor="student-search">Search students</label>
        <input
          id="student-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={inputClass()}
          placeholder={showArchived ? "Search archived students…" : "Search name or guardian…"}
          disabled={pending}
        />
      </div>

      {!showArchived ? (
        <div className="min-w-0">
          <label className="sr-only" htmlFor="student-class-filter">Class</label>
          <StudentClassSelect
            classes={classes}
            value={classroomId}
            onValueChange={(next) => {
              setClassroomId(next);
              if (next) setError(null);
            }}
            compact
            disabled={pending}
            emptyLabel="Choose class…"
          />
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}

      <button type="submit" className={primaryBtnClass()} disabled={pending}>
        {pending ? "Loading…" : query.trim() ? "Search" : "Show"}
      </button>

      <button type="button" onClick={clear} className={outlineBtnClass()} disabled={pending}>
        Clear
      </button>

      {error ? (
        <p className="sm:col-span-4 text-xs text-amber-100" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

//src/components/admin/TeacherAssignmentFormClient.tsx
"use client";

import { useMemo, useState } from "react";

type Phase = "KG" | "PRIMARY" | "JHS";

type ClassroomOption = {
  id: string;
  name: string | null;
  grade: string | null;
  arm: string | null;
};

type SubjectOption = {
  name: string;
  phase: string | null;
  level: string | null;
};

type Props = {
  teacherUserId: string;
  action: (formData: FormData) => void;
  classrooms: ClassroomOption[];
  subjects: SubjectOption[];
  focusSubject?: string;
  focusPhase?: string;
  focusClassroomId?: string;
  focusSessionId?: string;
  returnTo?: string;
};

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";

const submitBtn =
  "inline-flex items-center justify-center rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeSubjectKey(v: unknown) {
  return cleanStr(v)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLevelPrefix(subject: unknown) {
  return cleanStr(subject)
    .replace(
      /^(KG\s*[12]|KG[12]|BASIC\s*[1-9]|B[1-9]|BS[7-9]|PRIMARY\s*[1-6]|P[1-6]|JHS\s*[1-3]|JHS[1-3])\s*[-:–—]?\s+/i,
      ""
    )
    .trim();
}

function normalizePhase(raw: unknown): Phase | "" {
  const value = cleanStr(raw).toUpperCase().replace(/\s+/g, "_");

  if (value === "KG") return "KG";
  if (value === "PRIMARY" || value === "BASIC" || value === "BASIC_SCHOOL") return "PRIMARY";
  if (value === "JHS" || value === "JUNIOR_HIGH" || value === "JUNIOR_HIGH_SCHOOL") return "JHS";

  return "";
}

function levelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/[^A-Z0-9]+/g, "");

  let m = s.match(/^KG([12])$/);
  if (m) return `KG${m[1]}`;

  m = s.match(/^JHS([1-3])$/);
  if (m) return `JHS${m[1]}`;

  m = s.match(/^(BASIC|B|BS)([7-9])$/);
  if (m) return `JHS${Number(m[2]) - 6}`;

  m = s.match(/^(BASIC|B|PRIMARY|P)([1-6])$/);
  if (m) return `B${m[2]}`;

  return null;
}

function phaseFromLevel(raw: unknown): Phase | "" {
  const token = levelToken(raw);
  if (!token) return "";

  if (token.startsWith("KG")) return "KG";
  if (token.startsWith("B")) return "PRIMARY";
  if (token.startsWith("JHS")) return "JHS";

  return "";
}

function classroomToken(c: ClassroomOption) {
  return levelToken(c.grade) ?? levelToken(c.name);
}

function classroomPhase(c: ClassroomOption): Phase | "" {
  return phaseFromLevel(c.grade) || phaseFromLevel(c.name);
}

function levelOrder(token: string | null) {
  if (!token) return 999;

  if (token === "KG1") return 1;
  if (token === "KG2") return 2;

  if (/^B[1-6]$/.test(token)) return 10 + Number(token.slice(1));
  if (/^JHS[1-3]$/.test(token)) return 30 + Number(token.slice(3));

  return 999;
}

function levelLabel(token: string | null) {
  if (!token) return "Unclassified";

  if (token.startsWith("KG")) return `KG ${token.slice(2)}`;
  if (token.startsWith("B")) return `Basic ${token.slice(1)}`;
  if (token.startsWith("JHS")) return `JHS ${token.slice(3)}`;

  return token;
}

function classroomLabel(c: ClassroomOption) {
  const token = classroomToken(c);
  const base = levelLabel(token);
  const arm = cleanStr(c.arm);

  if (arm) return `${base} · Arm ${arm}`;
  return base;
}

function preferredSingleStreamClass(list: ClassroomOption[]) {
  const sorted = [...list].sort((a, b) => {
    const aArm = cleanStr(a.arm).toUpperCase();
    const bArm = cleanStr(b.arm).toUpperCase();

    const aScore = !aArm ? 0 : aArm === "A" ? 1 : 2;
    const bScore = !bArm ? 0 : bArm === "A" ? 1 : 2;

    return aScore - bScore || classroomLabel(a).localeCompare(classroomLabel(b));
  });

  return sorted[0] ?? null;
}

function subjectPhase(row: SubjectOption): Phase | "" {
  return normalizePhase(row.phase) || phaseFromLevel(row.level);
}

function cleanSubjectOptions(rows: SubjectOption[], phase: Phase, focusSubject?: string) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const row of rows) {
    const rowPhase = subjectPhase(row);
    if (rowPhase && rowPhase !== phase) continue;

    const label = stripLevelPrefix(row.name);
    if (!label) continue;

    const key = normalizeSubjectKey(label);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(label);
  }

  const focus = stripLevelPrefix(focusSubject);
  if (focus) {
    const key = normalizeSubjectKey(focus);
    if (!seen.has(key)) out.unshift(focus);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

export default function TeacherAssignmentFormClient({
  teacherUserId,
  action,
  classrooms,
  subjects,
  focusSubject = "",
  focusPhase = "",
  focusClassroomId = "",
  focusSessionId = "",
  returnTo = "/admin/teachers",
}: Props) {
  const initialPhase = normalizePhase(focusPhase) || "JHS";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [showMultiStream, setShowMultiStream] = useState(false);

  const phaseClassrooms = useMemo(() => {
    return classrooms
      .filter((c) => classroomPhase(c) === phase)
      .sort((a, b) => {
        const ao = levelOrder(classroomToken(a));
        const bo = levelOrder(classroomToken(b));
        return ao - bo || classroomLabel(a).localeCompare(classroomLabel(b));
      });
  }, [classrooms, phase]);

  const grouped = useMemo(() => {
    const map = new Map<string, ClassroomOption[]>();

    for (const classroom of phaseClassrooms) {
      const token = classroomToken(classroom) ?? "UNKNOWN";
      const list = map.get(token) ?? [];
      list.push(classroom);
      map.set(token, list);
    }

    return Array.from(map.entries())
      .sort((a, b) => levelOrder(a[0]) - levelOrder(b[0]))
      .map(([token, list]) => ({
        token,
        label: levelLabel(token),
        items: showMultiStream ? list : preferredSingleStreamClass(list) ? [preferredSingleStreamClass(list)!] : [],
        hiddenCount: Math.max(0, list.length - 1),
      }));
  }, [phaseClassrooms, showMultiStream]);

  const subjectOptions = useMemo(
    () => cleanSubjectOptions(subjects, phase, focusSubject),
    [subjects, phase, focusSubject]
  );

  const datalistId = `teacher-subject-options-${teacherUserId}`;

  return (
    <form action={action} className="mt-4 rounded-xl border border-white/10 bg-[#05070B] p-3">
      <input type="hidden" name="teacherUserId" value={teacherUserId} />
      <input type="hidden" name="returnTo" value={returnTo || "/admin/teachers"} />
      <input type="hidden" name="sessionId" value={focusSessionId} />

      <datalist id={datalistId}>
        {subjectOptions.map((subject) => (
          <option key={subject} value={subject} />
        ))}
      </datalist>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-[#AEB6C4]">Phase</label>
          <select
            name="phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value as Phase)}
            className={inputClass}
          >
            <option value="KG" className="bg-[#05070B] text-[#F7F4ED]">
              KG
            </option>
            <option value="PRIMARY" className="bg-[#05070B] text-[#F7F4ED]">
              Primary
            </option>
            <option value="JHS" className="bg-[#05070B] text-[#F7F4ED]">
              JHS
            </option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-[#AEB6C4]">Subject</label>
          <input
            name="subject"
            list={datalistId}
            defaultValue={stripLevelPrefix(focusSubject)}
            className={inputClass}
            placeholder={phase === "JHS" ? "e.g. English, Ewe, Science" : "e.g. Computing, Mathematics"}
          />
          <p className="mt-1 text-[11px] leading-5 text-[#8F98A8]">
            Start typing or choose from the phase subject list.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#07111F]/80 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#F7F4ED]">Class coverage</p>
            <p className="mt-1 text-xs leading-5 text-[#AEB6C4]">
              Tick the class levels this teacher handles. Single-stream view is shown by default.
            </p>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#C9CDD6]">
            <input
              type="checkbox"
              checked={showMultiStream}
              onChange={(e) => setShowMultiStream(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-[#05070B]"
            />
            Show multistream arms
          </label>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {grouped.length === 0 ? (
            <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-xs text-amber-100">
              No active classrooms found for this phase.
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.token} className="rounded-xl border border-white/10 bg-[#05070B] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#F7F4ED]">{group.label}</p>
                  {!showMultiStream && group.hiddenCount > 0 ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-[#AEB6C4]">
                      +{group.hiddenCount} arm(s)
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {group.items.map((classroom) => (
                    <label
                      key={classroom.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-xs text-[#C9CDD6] hover:bg-white/[0.06]"
                    >
                      <input
                        type="checkbox"
                        name="classroomIds"
                        value={classroom.id}
                        defaultChecked={classroom.id === focusClassroomId}
                        className="h-4 w-4 rounded border-white/20 bg-[#05070B]"
                      />
                      <span>{classroomLabel(classroom)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs font-semibold text-[#AEB6C4]">
          Specific classroom override
        </label>
        <select name="classroomId" defaultValue="" className={inputClass}>
          <option value="" className="bg-[#05070B] text-[#F7F4ED]">
            No extra specific class
          </option>
          {phaseClassrooms.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#05070B] text-[#F7F4ED]">
              {classroomLabel(c)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] leading-5 text-[#8F98A8]">
          Use only when assigning one exact class outside the checked coverage above.
        </p>
      </div>

      <button className={`${submitBtn} mt-3 w-full`}>
        Add teaching assignment
      </button>
    </form>
  );
}
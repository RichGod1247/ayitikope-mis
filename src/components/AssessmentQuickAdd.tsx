//src/components/AssessmentQuickAdd.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Role = "admin" | "teacher";

type ClassRow = {
  class_code: string;
  class_name: string | null;
  level: "KG" | "Primary" | "JHS" | string | null;
};

type StudentRow = {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  class_code: string | null;
};

const TERM_OPTIONS = ["Term 1", "Term 2", "Term 3"] as const;

const SUBJECTS: Record<"KG" | "Primary" | "JHS", string[]> = {
  KG: [
    "Language & Literacy",
    "Numeracy",
    "Creative Arts",
    "OWOP (Our World Our People)",
  ],
  Primary: [
    "English Language",
    "Mathematics",
    "Int. Science",
    "History",
    "R.M.E",
    "Ghanaian Language",
    "Creative Arts",
    "Computing",
    "French",
  ],
  JHS: [
    "English Language",
    "Mathematics",
    "Int. Science",
    "Social Studies",
    "R.M.E",
    "Ghanaian Language",
    "Creative Arts & Design",
    "Career Tech",
    "Computing",
    "French",
  ],
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function AssessmentQuickAdd({
  role = "admin",
  defaultClassCode,
  lockClass = false,
  subjectOptionsOverride,
  defaultSubject,
}: {
  role?: Role;
  defaultClassCode?: string;
  lockClass?: boolean;
  subjectOptionsOverride?: string[]; // if provided, override the subject list
  defaultSubject?: string;
}) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // form state
  const [classCode, setClassCode] = useState(defaultClassCode || "");
  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState(defaultSubject || "");
  const [atype, setAtype] = useState("Test");
  const [term, setTerm] = useState<(typeof TERM_OPTIONS)[number]>("Term 1");
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [date, setDate] = useState(todayISO());
  const [maxScore, setMaxScore] = useState<number | string>("100");
  const [score, setScore] = useState<number | string>("");
  const [grade, setGrade] = useState("");
  const [comment, setComment] = useState("");

  // Fetch classes and students once
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: cls }, { data: studs }] = await Promise.all([
        supabase.from("classes").select("class_code,class_name,level").order("level").order("class_name"),
        supabase.from("students").select("student_id,first_name,last_name,class_code").order("first_name"),
      ]);
      if (!mounted) return;
      setClasses(cls ?? []);
      setStudents(studs ?? []);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Derive current level from the selected class (uses class.level when available)
  const currentLevel = useMemo<"KG" | "Primary" | "JHS" | null>(() => {
    const c = classes.find((x) => x.class_code === classCode);
    if (!c?.level) return null;
    if (c.level === "KG" || c.level === "Primary" || c.level === "JHS") return c.level;
    return null;
  }, [classes, classCode]);

  const baseSubjectOptions = useMemo(() => {
    if (!currentLevel) return [];
    return SUBJECTS[currentLevel];
  }, [currentLevel]);

  const subjectOptions = subjectOptionsOverride ?? baseSubjectOptions;

  // Students filtered by chosen class
  const studentsForClass = useMemo(
    () => students.filter((s) => (classCode ? s.class_code === classCode : true)),
    [students, classCode]
  );

  // Reset the subject list when level/override changes
  useEffect(() => {
    if (subject && subjectOptions.length && !subjectOptions.includes(subject)) {
      setSubject(""); // clear invalid subject if class/level changed
    }
  }, [subjectOptions, subject]);

  // If a default class was passed later (e.g., after fetch), sync it once.
  useEffect(() => {
    if (defaultClassCode && !classCode) setClassCode(defaultClassCode);
  }, [defaultClassCode, classCode]);

  // If a default subject is provided and current subject empty, set it.
  useEffect(() => {
    if (defaultSubject && !subject) setSubject(defaultSubject);
  }, [defaultSubject, subject]);

  function fullName(s: StudentRow) {
    return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.student_id;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!classCode) {
      setStatus("⚠️ Please select a class.");
      return;
    }
    if (!studentId) {
      setStatus("⚠️ Please select a student.");
      return;
    }
    if (!subject.trim()) {
      setStatus("⚠️ Please select a subject.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        student_id: studentId,
        class_code: classCode,
        subject: subject.trim(),
        assessment_type: atype,
        max_score: maxScore === "" ? null : Number(maxScore),
        score: score === "" ? null : Number(score),
        term,
        academic_year: academicYear,
        date,
        grade: grade || null,
        comment: comment || null,
      };

      const { error } = await supabase.from("assessments").insert([payload]);
      if (error) {
        setStatus(`❌ ${error.message}`);
      } else {
        setStatus("✅ Assessment saved.");
        // keep class/subject for speed, reset the rest
        setStudentId("");
        setAtype("Test");
        setMaxScore("100");
        setScore("");
        setGrade("");
        setComment("");
      }
    } catch (err: any) {
      setStatus(`❌ ${String(err?.message || err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm">
      {/* Class & Student */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Class *</label>
          <select
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            disabled={lockClass}
          >
            <option value="">{lockClass ? "Locked to your class" : "— Select Class —"}</option>
            {classes.map((c) => (
              <option key={c.class_code} value={c.class_code}>
                {c.level ? `${c.level} • ` : ""}{c.class_name || c.class_code} ({c.class_code})
              </option>
            ))}
          </select>
          {lockClass && (
            <p className="mt-1 text-xs text-gray-500">This is your homeroom class.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Student *</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            disabled={!classCode}
          >
            <option value="">{classCode ? "— Select Student —" : "Select a class first"}</option>
            {studentsForClass.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {fullName(s)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {role === "teacher"
              ? "Pick your class; students appear automatically."
              : "Admin can pick any class and student (from registry)."}
          </p>
        </div>
      </div>

      {/* Subject & Type */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Subject *{currentLevel ? <span className="text-gray-500"> ({currentLevel})</span> : null}
          </label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!subjectOptions.length}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          >
            <option value="">{subjectOptions.length ? "— Select Subject —" : "Select a class to see subjects"}</option>
            {subjectOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Assessment Type</label>
          <select
            value={atype}
            onChange={(e) => setAtype(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          >
            <option>Test</option>
            <option>Quiz</option>
            <option>Project</option>
            <option>Exam</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      {/* Term, Year, Date */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Term</label>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value as (typeof TERM_OPTIONS)[number])}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          >
            {TERM_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Academic Year</label>
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2025/2026"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {/* Scores */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Max Score</label>
          <input
            type="number"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Score</label>
          <input
            type="number"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Grade (optional)</label>
          <input
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="A, B+, 1, 2 …"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Comment (optional)</label>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Teacher’s remark"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? "Saving..." : "Add Assessment"}
        </button>
        {status && <span className="text-sm">{status}</span>}
      </div>
    </form>
  );
}

// src/app/parent/report/term/page.tsx
"use client";

import { useState } from "react";

type SubjectRow = {
  subject: string;
  classScore: number;
  examScore: number;
  total: number;
  grade: string;
  remark: string;
};

const demoLearner = {
  name: "Ama Demo",
  indexNo: "STU/2025/001",
  className: "B6 – Gold",
  term: "1st Term",
  academicYear: "2025/2026",
};

const demoSubjects: SubjectRow[] = [
  {
    subject: "English Language",
    classScore: 28,
    examScore: 62,
    total: 90,
    grade: "1",
    remark: "Excellent – keeps reading habit strong.",
  },
  {
    subject: "Mathematics",
    classScore: 25,
    examScore: 54,
    total: 79,
    grade: "3",
    remark: "Good. Revise fractions and word problems.",
  },
  {
    subject: "Science",
    classScore: 26,
    examScore: 50,
    total: 76,
    grade: "3",
    remark: "Good understanding. More practice with experiments.",
  },
  {
    subject: "Social Studies",
    classScore: 24,
    examScore: 50,
    total: 74,
    grade: "3",
    remark: "Good. Pay attention to map work and dates.",
  },
  {
    subject: "ICT",
    classScore: 29,
    examScore: 60,
    total: 89,
    grade: "2",
    remark: "Very good. Continue practising typing and coding.",
  },
];

const overallRemark =
  "Ama has performed very well this term, especially in English and ICT. With a little more revision in Mathematics, she can move from good to excellent. She is respectful, participates actively in class and should be encouraged to keep reading daily at home.";

export default function ParentTermReportDemoPage() {
  const [template, setTemplate] = useState<"color" | "plain">("color");

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
            EduLife OS · Parent · Term report demo
          </div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                BECE-style term report (demo)
              </h1>
              <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
                This page shows{" "}
                <span className="font-semibold">
                  how your child&apos;s final report can look
                </span>{" "}
                inside EduLife OS. For now it uses sample data. Later, it will
                pull real marks and attendance directly from the school system.
              </p>
            </div>
            <div className="text-xs text-zinc-500 md:text-right space-y-1">
              <p>
                Term:{" "}
                <span className="font-semibold">{demoLearner.term}</span>
              </p>
              <p>
                Academic year:{" "}
                <span className="font-semibold">
                  {demoLearner.academicYear}
                </span>
              </p>
            </div>
          </div>
        </header>

        {/* Template toggle */}
        <section className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 md:px-5 md:py-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-900">
              Choose report style
            </h2>
            <p className="text-[11px] md:text-xs text-zinc-600 max-w-xl">
              The{" "}
              <span className="font-semibold">colorful template</span> is ideal
              for on-screen viewing and discussions. The{" "}
              <span className="font-semibold">plain template</span> is better
              for low-ink printing and official filing at home.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setTemplate("color")}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                template === "color"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-transparent text-zinc-700 hover:bg-white"
              }`}
            >
              Colorful
            </button>
            <button
              type="button"
              onClick={() => setTemplate("plain")}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                template === "plain"
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "bg-transparent text-zinc-700 hover:bg-white"
              }`}
            >
              Plain
            </button>
          </div>
        </section>

        {/* Report preview */}
        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-3 md:p-4 lg:p-6">
          {template === "color" ? (
            <ColorfulReport />
          ) : (
            <PlainReport />
          )}
        </section>

        {/* Note to parent */}
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 md:px-5 md:py-4 shadow-sm text-[11px] md:text-xs text-amber-900 space-y-1.5">
          <p>
            <span className="font-semibold">Note:</span> This is a{" "}
            <span className="font-semibold">demo report</span> using sample
            data. In a later EduLife OS phase, this page will connect to your
            child&apos;s{" "}
            <span className="font-semibold">
              real attendance, continuous assessment and exam scores
            </span>
            . The goal is to make reports{" "}
            <span className="font-semibold">
              clear and helpful for family conversations
            </span>
            , not just papers in a file.
          </p>
        </section>
      </div>
    </main>
  );
}

/* -----------------------------
 * Colorful template
 * ----------------------------*/

function ColorfulReport() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-linear-to-b from-indigo-50 via-white to-sky-50 p-4 md:p-6 lg:p-8">
      {/* Watermark stripe */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-linear-to-b from-indigo-100/40 via-emerald-50/40 to-sky-100/30 opacity-60" />

      <div className="relative space-y-4 md:space-y-6">
        {/* Header row */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-indigo-100 pb-4">
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-indigo-900">
              Ayitikope M/A Basic School
            </h2>
            <p className="text-[11px] md:text-xs text-indigo-800/80">
              Term Report · {demoLearner.term}, {demoLearner.academicYear}
            </p>
          </div>
          <div className="text-[11px] md:text-xs text-zinc-700 space-y-1 text-left md:text-right">
            <p>
              Learner:{" "}
              <span className="font-semibold">{demoLearner.name}</span>
            </p>
            <p>
              Index No:{" "}
              <span className="font-mono">{demoLearner.indexNo}</span>
            </p>
            <p>
              Class:{" "}
              <span className="font-semibold">{demoLearner.className}</span>
            </p>
          </div>
        </div>

        {/* Subjects table */}
        <div className="rounded-xl border border-indigo-100 bg-white/80 shadow-sm overflow-hidden">
          <table className="w-full text-[11px] md:text-xs">
            <thead className="bg-indigo-50/80">
              <tr>
                <Th align="left">Subject</Th>
                <Th>Class score</Th>
                <Th>Exam score</Th>
                <Th>Total (100)</Th>
                <Th>Grade</Th>
                <Th align="left">Remark</Th>
              </tr>
            </thead>
            <tbody>
              {demoSubjects.map((row, idx) => {
                const zebra =
                  idx % 2 === 0 ? "bg-white" : "bg-indigo-50/30";
                return (
                  <tr key={row.subject} className={zebra}>
                    <Td align="left">{row.subject}</Td>
                    <Td>{row.classScore}</Td>
                    <Td>{row.examScore}</Td>
                    <Td>{row.total}</Td>
                    <Td>
                      <span className="inline-flex items-center justify-center rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[10px] text-indigo-900">
                        {row.grade}
                      </span>
                    </Td>
                    <Td align="left">{row.remark}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Overall summary */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-3 md:px-4 md:py-4">
            <h3 className="text-xs md:text-sm font-semibold text-emerald-900 mb-1.5">
              Class teacher&apos;s summary
            </h3>
            <p className="text-[11px] md:text-xs text-emerald-900/90 whitespace-pre-line">
              {overallRemark}
            </p>
          </div>
          <div className="space-y-3 text-[11px] md:text-xs">
            <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2">
              <h4 className="text-[11px] font-semibold text-sky-900 mb-1">
                Attendance &amp; behaviour (placeholders)
              </h4>
              <p className="text-[11px] text-sky-900/90">
                • Attendance: to be pulled from daily register in EduLife OS.{"\n"}
                • Behaviour: short note from class teacher on conduct and attitude.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white/80 px-3 py-2">
              <h4 className="text-[11px] font-semibold text-zinc-900 mb-1">
                Headteacher&apos;s comment (placeholder)
              </h4>
              <p className="text-[11px] text-zinc-700">
                Space reserved for a brief comment from the headteacher,
                highlighting values, progress and expectations for next term.
              </p>
            </div>
          </div>
        </div>

        {/* Footer strip */}
        <div className="border-t border-indigo-100 pt-3 mt-1 text-[10px] text-zinc-500 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p>
            This layout is designed to make it{" "}
            <span className="font-medium">easy to talk</span> about your child&apos;s
            learning at home.
          </p>
          <p className="font-mono">
            EduLife OS · Demo report · Not for official use
          </p>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------
 * Plain template
 * ----------------------------*/

function PlainReport() {
  return (
    <div className="rounded-2xl border border-zinc-300 bg-white px-4 py-4 md:px-6 md:py-5 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="border-b border-zinc-200 pb-3 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-zinc-900">
            Ayitikope M/A Basic School
          </h2>
          <p className="text-[11px] md:text-xs text-zinc-600">
            Term report · {demoLearner.term}, {demoLearner.academicYear}
          </p>
        </div>
        <div className="text-[11px] md:text-xs text-zinc-700 space-y-0.5 text-left md:text-right">
          <p>
            Name: <span className="font-semibold">{demoLearner.name}</span>
          </p>
          <p>
            Index No:{" "}
            <span className="font-mono">{demoLearner.indexNo}</span>
          </p>
          <p>
            Class:{" "}
            <span className="font-semibold">{demoLearner.className}</span>
          </p>
        </div>
      </div>

      {/* Subjects table */}
      <div className="border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full text-[11px] md:text-xs">
          <thead className="bg-zinc-50">
            <tr>
              <ThPlain align="left">Subject</ThPlain>
              <ThPlain>Class score</ThPlain>
              <ThPlain>Exam score</ThPlain>
              <ThPlain>Total (100)</ThPlain>
              <ThPlain>Grade</ThPlain>
              <ThPlain align="left">Remark</ThPlain>
            </tr>
          </thead>
          <tbody>
            {demoSubjects.map((row, idx) => {
              const zebra =
                idx % 2 === 0 ? "bg-white" : "bg-zinc-50/70";
              return (
                <tr key={row.subject} className={zebra}>
                  <TdPlain align="left">{row.subject}</TdPlain>
                  <TdPlain>{row.classScore}</TdPlain>
                  <TdPlain>{row.examScore}</TdPlain>
                  <TdPlain>{row.total}</TdPlain>
                  <TdPlain>{row.grade}</TdPlain>
                  <TdPlain align="left">{row.remark}</TdPlain>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Comments */}
      <div className="grid gap-3 md:grid-cols-2 text-[11px] md:text-xs">
        <div className="border border-zinc-200 rounded-lg px-3 py-2 min-h-[88px]">
          <div className="text-[11px] font-semibold text-zinc-900 mb-1">
            Class teacher&apos;s remark
          </div>
          <p className="text-zinc-700 whitespace-pre-line">
            {overallRemark}
          </p>
        </div>
        <div className="space-y-2">
          <div className="border border-zinc-200 rounded-lg px-3 py-2 min-h-[64px]">
            <div className="text-[11px] font-semibold text-zinc-900 mb-1">
              Headteacher&apos;s remark
            </div>
            <p className="text-zinc-700">
              ___________________________________________
              <br />
              ___________________________________________
            </p>
          </div>
          <div className="border border-zinc-200 rounded-lg px-3 py-2 min-h-[64px]">
            <div className="text-[11px] font-semibold text-zinc-900 mb-1">
              Next term begins
            </div>
            <p className="text-zinc-700">
              ________________________
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 pt-2 mt-1 text-[10px] text-zinc-500 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <p>Designed for clear reading and low-ink printing at home.</p>
        <p className="font-mono">
          EduLife OS · Demo · Not for official use
        </p>
      </div>
    </div>
  );
}

/* -----------------------------
 * Small table helpers
 * ----------------------------*/

function Th({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold text-indigo-900 ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-3 py-1.5 text-[11px] text-zinc-800 ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </td>
  );
}

function ThPlain({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-1.5 text-[11px] font-semibold text-zinc-600 ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}

function TdPlain({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-3 py-1.5 text-[11px] text-zinc-800 ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {children}
    </td>
  );
}

//src/components/admin/StudentBulkImportCard.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StudentClassSelect from "@/components/admin/StudentClassSelect";
import {
  previewBulkStudentImport,
  type ClassroomLite,
  type ParsedBulkStudentRow,
  type PreviewIssue,
} from "@/lib/studentImport";

type ImportResult =
  | null
  | {
      totalRows: number;
      importedCount: number;
      invalidCount: number;
      duplicateCount: number;
      errors: Array<{ rowNumber: number; error: string }>;
    };

function friendlyReason(code: string): string {
  switch (code) {
    case "MISSING_NAME":
      return "Missing firstName or lastName.";
    case "INVALID_GUARDIAN_PHONE_GH":
      return "Guardian phone must be a Ghana number (024…, 055…, +233…).";
    case "INVALID_DATE_OF_BIRTH":
      return "Date of birth must use YYYY-MM-DD.";
    case "DATE_OF_BIRTH_IN_FUTURE":
      return "Date of birth cannot be in the future.";
    case "UNKNOWN_CLASS_LABEL":
      return "Class not recognized. Use formats like “KG 1”, “B1 A”, “JHS 3 B”.";
    case "AMBIGUOUS_CLASS_LABEL":
      return "Class label matches multiple classes. Add the arm (A–D) or be more specific.";
    case "INVALID_CLASS_LABEL":
      return "Class label has invalid characters.";
    case "DUPLICATE_IN_BATCH":
      return "Duplicate row inside this upload.";
    case "DUPLICATE_RECENTLY_IMPORTED":
      return "Looks like it was imported very recently (duplicate blocked).";
    default:
      return code;
  }
}

/**
 * Excel can export CSV using:
 * - tabs (TSV) when copied
 * - semicolons (;) depending on locale settings
 *
 * We normalize delimiter to comma OUTSIDE quotes.
 */
function normalizeCsvText(raw: string): string {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return "";

  const firstLine = text.split("\n")[0] ?? "";
  const likelySemicolon = firstLine.includes(";") && !firstLine.includes(",");
  const likelyTab = firstLine.includes("\t") && !firstLine.includes(",");

  if (!likelySemicolon && !likelyTab) return text;

  const target = likelyTab ? "\t" : ";";
  let out = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        out += '""';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      out += ch;
      continue;
    }

    if (!inQuotes && ch === target) {
      out += ",";
      continue;
    }

    out += ch;
  }

  return out;
}

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function inputClass() {
  return "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25";
}

function outlineBtnClass() {
  return "rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-60";
}

function primaryBtnClass() {
  return "rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:opacity-60";
}

export default function StudentBulkImportCard({
  classes,
  embedded = false,
}: {
  classes: ClassroomLite[];
  embedded?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);

  const [defaultClassroomId, setDefaultClassroomId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult>(null);

  const preview = useMemo(() => previewBulkStudentImport(csvText, classes), [csvText, classes]);

  const canImport = !submitting && !preview.headerError && preview.totalRows > 0;

  function buildTemplateCsv() {
    return normalizeCsvText(
      [
        "firstName,lastName,dateOfBirth,class,guardianName,guardianPhone,gender,note",
        "Ama,Mensah,2015-06-12,B1 A,Esi Mensah,0241234567,Female,New learner",
        "Kwesi,Owusu,2019-03-08,KG 1,Kojo Owusu,0551234567,Male,",
        "Amina,Sarpong,2013-11-25,JHS 3 B,Ali Sarpong,0201234567,Female,Transfer",
      ].join("\n")
    );
  }

  function onDownloadTemplate() {
    setServerError(null);
    setResult(null);
    downloadTextFile("edulife_students_template.csv", buildTemplateCsv());
  }

  async function onPickFile(file: File | null) {
    if (!file) return;

    setServerError(null);
    setResult(null);

    const name = file.name || "upload.csv";
    setFileName(name);

    const text = await file.text();
    setCsvText(normalizeCsvText(text));
  }

  function rowsWithDefaults(rows: ParsedBulkStudentRow[]): ParsedBulkStudentRow[] {
    const selectedClass = classes.find((cls) => cls.id === defaultClassroomId) ?? null;
    const defaultClassLabel = selectedClass
      ? selectedClass.arm
        ? `${selectedClass.name} ${selectedClass.arm}`
        : selectedClass.name
      : "";

    if (!defaultClassLabel) return rows;

    return rows.map((row) => ({
      ...row,
      classLabel: row.classLabel && String(row.classLabel).trim() ? row.classLabel : defaultClassLabel,
    }));
  }

  async function onImport() {
    setSubmitting(true);
    setServerError(null);
    setResult(null);

    try {
      const rowsToSend = rowsWithDefaults(preview.rows);

      const res = await fetch("/api/admin/students/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ rows: rowsToSend }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setServerError(String(data?.error || "Bulk import failed."));
        return;
      }

      setResult({
        totalRows: Number(data.totalRows || 0),
        importedCount: Number(data.importedCount || 0),
        invalidCount: Number(data.invalidCount || 0),
        duplicateCount: Number(data.duplicateCount || 0),
        errors: Array.isArray(data.errors) ? data.errors : [],
      });

      if (Number(data.importedCount || 0) > 0) router.refresh();
    } catch (caught) {
      setServerError(caught instanceof Error ? caught.message : "Network error during import.");
    } finally {
      setSubmitting(false);
    }
  }

  const topIssues: PreviewIssue[] = preview.issues.slice(0, 20);

  const containerClass = embedded
    ? "space-y-3 text-[#F7F4ED]"
    : "rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl space-y-3 text-[#F7F4ED]";

  return (
    <div className={containerClass}>
      <div>
        <h2 className="text-sm font-semibold text-[#F7F4ED]">Bulk Import (Excel-friendly)</h2>
        <p className="mt-1 text-sm text-[#C9CDD6]">
          Download the template, fill it in Excel, then upload the CSV. DOB uses YYYY-MM-DD.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <button type="button" onClick={onDownloadTemplate} className={primaryBtnClass()}>
          Download template
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={outlineBtnClass()}
          disabled={submitting}
        >
          Upload filled CSV
        </button>

        <button
          type="button"
          onClick={() => {
            setCsvText("");
            setFileName(null);
            setResult(null);
            setServerError(null);
            setDefaultClassroomId("");
            if (fileRef.current) fileRef.current.value = "";
          }}
          className={outlineBtnClass()}
          disabled={submitting}
        >
          Reset
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
      />

      {fileName ? (
        <div className="text-xs text-[#C9CDD6]">
          File loaded: <span className="font-mono">{fileName}</span>
        </div>
      ) : (
        <div className="text-xs text-[#8F98A8]">
          Tip: In Excel, use <b className="text-[#F7F4ED]">Save As → CSV (Comma delimited)</b>, then upload that file.
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-[#07111F]/80 p-3 space-y-2">
        <div className="text-xs font-semibold text-[#F7F4ED]">Optional: assign a default class</div>
        <p className="text-[11px] text-[#C9CDD6]">
          If some rows have an empty <b className="text-[#F7F4ED]">class</b> cell, we can apply one class to all of them during import.
        </p>

        <StudentClassSelect
          classes={classes}
          value={defaultClassroomId}
          onValueChange={setDefaultClassroomId}
          disabled={submitting}
          emptyLabel="— No default class —"
          showModeHint
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-[#07111F]/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[#F7F4ED]">Preview</p>
            <p className="text-[11px] text-[#8F98A8]">
              We validate here, then the server validates again.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPaste((v) => !v)}
            className="text-xs text-[#C9CDD6] underline underline-offset-4"
          >
            {showPaste ? "Hide paste box" : "Show paste box"}
          </button>
        </div>

        {showPaste ? (
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(normalizeCsvText(e.target.value))}
            rows={7}
            className="mt-3 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 font-mono text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25"
            placeholder={`firstName,lastName,dateOfBirth,class,guardianName,guardianPhone,gender,note
Ama,Mensah,2015-06-12,B1 A,Esi Mensah,0241234567,Female,New learner`}
          />
        ) : null}

        {preview.headerError ? (
          <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {preview.headerError}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[#D7DCE5]">
            Total rows: <b>{preview.totalRows}</b>
          </div>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-emerald-100">
            Valid: <b>{preview.validCount}</b>
          </div>
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-rose-100">
            Invalid: <b>{preview.invalidCount}</b>
          </div>
          <div className="rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-amber-100">
            Duplicates (batch): <b>{preview.duplicateCount}</b>
          </div>
        </div>

        {topIssues.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-[#05070B] p-4">
            <p className="text-sm font-semibold text-[#F7F4ED]">Issues to fix</p>
            <div className="mt-2 max-h-56 space-y-2 overflow-auto">
              {topIssues.map((issue) => (
                <div
                  key={`${issue.rowNumber}-${issue.reasons.join("-")}`}
                  className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-[#D7DCE5]"
                >
                  <b className="text-[#F7F4ED]">Row {issue.rowNumber}</b>:{" "}
                  {issue.reasons.map((r) => friendlyReason(r)).join(" ")}
                </div>
              ))}
              {preview.issues.length > 20 ? (
                <p className="text-xs text-[#8F98A8]">
                  Showing first 20 issues out of {preview.issues.length}.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onImport} disabled={!canImport} className={primaryBtnClass()}>
            {submitting ? "Importing..." : "Import"}
          </button>

          <p className="text-[11px] text-[#8F98A8]">
            You can import even if some rows are invalid — the server will skip bad rows and report them.
          </p>
        </div>

        {serverError ? (
          <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {serverError}
          </div>
        ) : null}

        {result ? (
          <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100 space-y-1">
            <div>
              Imported <b>{result.importedCount}</b> of <b>{result.totalRows}</b> row(s).
            </div>
            <div>
              Invalid: <b>{result.invalidCount}</b> · Duplicates blocked: <b>{result.duplicateCount}</b>
            </div>
            {result.errors.length ? (
              <div className="pt-1 text-xs text-emerald-50">
                First errors:{" "}
                {result.errors
                  .slice(0, 8)
                  .map((e) => `row ${e.rowNumber}=${friendlyReason(e.error)}`)
                  .join(" · ")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
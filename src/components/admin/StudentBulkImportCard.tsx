"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

  // Decide whether we should normalize ; or \t to commas.
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
      // Handle escaped quotes ("")
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

function classLabelHuman(c: ClassroomLite) {
  const parts = [c.name, c.grade, c.arm ? `Arm ${c.arm}` : null].filter(Boolean);
  return parts.join(" · ");
}

export default function StudentBulkImportCard({ classes }: { classes: ClassroomLite[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);

  const [defaultClassLabel, setDefaultClassLabel] = useState<string>(""); // optional
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult>(null);

  const preview = useMemo(() => previewBulkStudentImport(csvText, classes), [csvText, classes]);

  const canImport =
    !submitting &&
    !preview.headerError &&
    preview.totalRows > 0; // allow partial import; server will validate again

  function buildTemplateCsv() {
    // Keep it dead simple: required headers first; Excel-friendly.
    return normalizeCsvText(
      [
        "firstName,lastName,class,guardianName,guardianPhone,gender,note",
        "Ama,Mensah,B1 A,Esi Mensah,0241234567,Female,New learner",
        "Kwesi,Owusu,KG 1,Kojo Owusu,0551234567,Male,",
        "Amina,Sarpong,JHS 3 B,Ali Sarpong,0201234567,Female,Transfer",
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
    const dl = String(defaultClassLabel ?? "").trim();
    if (!dl) return rows;
    return rows.map((r) => ({
      ...r,
      classLabel: r.classLabel && String(r.classLabel).trim() ? r.classLabel : dl,
    }));
  }

  async function onImport() {
    setSubmitting(true);
    setServerError(null);
    setResult(null);

    try {
      // IMPORTANT: We still send rows (not raw CSV), because server must re-validate.
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
    } catch (e: any) {
      setServerError(String(e?.message || "Network error during import."));
    } finally {
      setSubmitting(false);
    }
  }

  const topIssues: PreviewIssue[] = preview.issues.slice(0, 20);

  return (
    <div className="rounded-2xl border bg-white p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Bulk Import (Excel-friendly)</h2>
        <p className="text-sm text-zinc-600 mt-1">
          1) Download template → 2) Fill in Excel → 3) Upload → Import.
        </p>
      </div>

      {/* STEP ACTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onDownloadTemplate}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm"
        >
          Download template
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border px-4 py-2 text-sm"
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
            setDefaultClassLabel("");
            if (fileRef.current) fileRef.current.value = "";
          }}
          className="rounded-xl border px-4 py-2 text-sm"
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
        <div className="text-xs text-zinc-600">
          File loaded: <span className="font-mono">{fileName}</span>
        </div>
      ) : (
        <div className="text-xs text-zinc-500">
          Tip: In Excel, use <b>Save As → CSV (Comma delimited)</b>, then upload that file.
        </div>
      )}

      {/* OPTIONAL DEFAULT CLASS */}
      <div className="rounded-xl border bg-zinc-50 p-4 space-y-2">
        <div className="text-xs font-semibold text-zinc-700">Optional: assign a default class</div>
        <p className="text-[11px] text-zinc-600">
          If some rows have an empty <b>class</b> cell, we can apply one class to all of them during import.
        </p>

        <select
          value={defaultClassLabel}
          onChange={(e) => setDefaultClassLabel(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
          disabled={submitting}
        >
          <option value="">— No default class —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.arm ? `${c.name} ${c.arm}` : c.name}>
              {classLabelHuman(c)}
            </option>
          ))}
        </select>
      </div>

      {/* ADVANCED: paste area */}
      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Preview</p>
            <p className="text-[11px] text-zinc-500">
              We validate here, then the server validates again (bank-grade).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPaste((v) => !v)}
            className="text-xs underline text-zinc-600"
          >
            {showPaste ? "Hide paste box" : "Show paste box"}
          </button>
        </div>

        {showPaste ? (
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(normalizeCsvText(e.target.value))}
            rows={10}
            className="mt-3 w-full rounded-xl border px-3 py-2 text-sm font-mono"
            placeholder={`firstName,lastName,class,guardianName,guardianPhone,gender,note
Ama,Mensah,B1 A,Esi Mensah,0241234567,Female,New learner`}
          />
        ) : null}

        {preview.headerError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {preview.headerError}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div className="rounded-xl border bg-white px-3 py-2">
            Total rows: <b>{preview.totalRows}</b>
          </div>
          <div className="rounded-xl border bg-white px-3 py-2">
            Valid: <b>{preview.validCount}</b>
          </div>
          <div className="rounded-xl border bg-white px-3 py-2">
            Invalid: <b>{preview.invalidCount}</b>
          </div>
          <div className="rounded-xl border bg-white px-3 py-2">
            Duplicates (batch): <b>{preview.duplicateCount}</b>
          </div>
        </div>

        {topIssues.length > 0 ? (
          <div className="mt-3 rounded-xl border p-4">
            <p className="text-sm font-semibold text-zinc-900">Issues to fix</p>
            <div className="mt-2 max-h-56 overflow-auto space-y-2">
              {topIssues.map((issue) => (
                <div
                  key={`${issue.rowNumber}-${issue.reasons.join("-")}`}
                  className="text-xs text-zinc-700 border rounded-lg p-2"
                >
                  <b>Row {issue.rowNumber}</b>:{" "}
                  {issue.reasons.map((r) => friendlyReason(r)).join(" ")}
                </div>
              ))}
              {preview.issues.length > 20 ? (
                <p className="text-xs text-zinc-500">
                  Showing first 20 issues out of {preview.issues.length}.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onImport}
            disabled={!canImport}
            className="rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {submitting ? "Importing..." : "Import"}
          </button>

          <p className="text-[11px] text-zinc-500">
            You can import even if some rows are invalid — the server will skip bad rows and report them.
          </p>
        </div>

        {serverError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {serverError}
          </div>
        ) : null}

        {result ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 space-y-1">
            <div>
              Imported <b>{result.importedCount}</b> of <b>{result.totalRows}</b> row(s).
            </div>
            <div>
              Invalid: <b>{result.invalidCount}</b> · Duplicates blocked: <b>{result.duplicateCount}</b>
            </div>
            {result.errors.length ? (
              <div className="pt-1 text-xs text-emerald-950">
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
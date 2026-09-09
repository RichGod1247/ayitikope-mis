"use client";

export default function PrintLessonNoteActions() {
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2.5 text-zinc-800 print:hidden sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold">Print-ready Lesson Note</p>
        <p className="mt-0.5 text-[11px] leading-4 text-zinc-600">
          On a phone, tablet or computer, tap the button to open this device&apos;s print or PDF options.
        </p>
      </div>

      <button
        type="button"
        className="min-h-11 w-full shrink-0 rounded-xl bg-[#071A3D] px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:translate-y-px sm:w-auto"
        onClick={() => window.print()}
        aria-label="Print or save this Lesson Note as PDF"
      >
        Print / Save PDF
      </button>
    </div>
  );
}

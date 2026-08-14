import TeacherAttendanceSafetyControl from "./TeacherAttendanceSafetyControl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function SuperadminSafetyControlsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.10)] md:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          EduLife OS · Platform Safety Controls
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">
          Human-impact safeguards
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
          Keep sensitive accountability capabilities unavailable until the
          institutional safeguards needed for fair use are ready. Disabling a
          feature preserves historical evidence; it does not delete records.
        </p>
      </section>

      <TeacherAttendanceSafetyControl />
    </div>
  );
}

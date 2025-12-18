// src/app/headteacher-portal/page.tsx
import Image from "next/image";
import Link from "next/link";
import HeadteacherPortalClient from "@/components/HeadteacherPortalClient";

type PageProps = {
  searchParams: {
    tenantId?: string;
    headUserId?: string;
  };
};

/**
 * Headteacher Portal entry page.
 *
 * - If headUserId is present → show the calm Headteacher Portal workspace
 *   (HeadteacherPortalClient) + a button to open the classic Headteacher Dashboard.
 *
 * - If headUserId is missing → show a marketing-style page that explains
 *   what headteachers get inside EduLife OS, with a sign-in CTA under a logo.
 */
export default function HeadteacherPortalPage({ searchParams }: PageProps) {
  const tenantId =
    searchParams.tenantId ?? "cmhhnghn00008vcpgp3fl07fl"; // demo tenant fallback
  const headUserId = searchParams.headUserId || "";

  const hasHeadIdentity = Boolean(headUserId);

  // 👉 update this if your auth route is different (e.g. "/login")
  const signInHref = `/auth/signin?redirect=/headteacher-portal`;

  if (!hasHeadIdentity) {
    // ---------- LOGGED-OUT / NO-ID VIEW ----------
    return (
      <main className="min-h-screen bg-gradient-to-b from-sky-50 via-zinc-50 to-white">
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-12 space-y-8">
          {/* Hero */}
          <header className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-sky-800 shadow-sm">
              EduLife OS · Headteacher Portal
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Built for calm, honest leadership
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
              A calm cockpit for your whole school
            </h1>
            <p className="text-sm md:text-base text-zinc-600 max-w-2xl">
              Once signed in, headteachers can see{" "}
              <span className="font-semibold">attendance pulses</span>,{" "}
              <span className="font-semibold">
                continuous assessment trends
              </span>
              , and{" "}
              <span className="font-semibold">
                NaCCA-aligned lesson note supervision
              </span>{" "}
              — all designed to protect both children and teachers.
            </p>
          </header>

          {/* 2-column layout: Features + Sign-in card */}
          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)] gap-6">
            {/* LEFT: What headteachers can do inside EduLife OS */}
            <div className="space-y-4">
              <div className="rounded-3xl border border-zinc-200 bg-white/90 shadow-sm px-4 py-4 md:px-6 md:py-5 space-y-4">
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  What headteachers get once they sign in
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] md:text-xs text-zinc-700">
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 space-y-1">
                    <p className="font-semibold text-sky-900">
                      Weekly attendance &amp; health pulse
                    </p>
                    <p>
                      See which classes are consistently present, which need
                      attention, and how the{" "}
                      <span className="font-semibold">
                        attendance + temperature
                      </span>{" "}
                      device (later) is flagging possible health concerns.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-2.5 space-y-1">
                    <p className="font-semibold text-violet-900">
                      Assessment &amp; results overview
                    </p>
                    <p>
                      Compare{" "}
                      <span className="font-semibold">
                        class averages by subject, teacher and term
                      </span>{" "}
                      so that praise and support are grounded in truth, not
                      guesswork.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 space-y-1">
                    <p className="font-semibold text-emerald-900">
                      Lesson notes supervision
                    </p>
                    <p>
                      See which teachers have submitted{" "}
                      <span className="font-semibold">
                        NaCCA-aligned lesson notes
                      </span>{" "}
                      and gently return notes that need improvement.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 space-y-1">
                    <p className="font-semibold text-amber-900">
                      Teacher wellbeing &amp; communication
                    </p>
                    <p>
                      Quiet weekly{" "}
                      <span className="font-semibold">
                        teacher wellbeing check-ins
                      </span>{" "}
                      and future{" "}
                      <span className="font-semibold">
                        fees &amp; SMS nudges
                      </span>{" "}
                      that honour parents instead of harassing them.
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500">
                  Everything is intentionally built around{" "}
                  <span className="font-semibold">
                    character, integrity and calm leadership
                  </span>{" "}
                  so that numbers support human judgment — not replace it.
                </p>
              </div>

              <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/80 px-4 py-3 text-[11px] md:text-xs text-zinc-600">
                <p>
                  Once your school is fully onboarded, you and your deputies
                  will come here and simply{" "}
                  <span className="font-semibold">
                    sign in with your EduLife OS account
                  </span>
                  . From there, you can open{" "}
                  <span className="font-semibold">
                    weekly attendance pulses
                  </span>{" "}
                  and{" "}
                  <span className="font-semibold">
                    assessment overviews
                  </span>{" "}
                  in one or two clicks.
                </p>
              </div>
            </div>

            {/* RIGHT: Sign-in card with logo */}
            <div className="flex items-start justify-center">
              <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white/95 shadow-sm px-4 py-5 md:px-5 md:py-6 space-y-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-14 w-14 rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center overflow-hidden">
                    {/* Assumes public/logo.png exists */}
                    <Image
                      src="/logo.png"
                      alt="School logo"
                      fill
                      sizes="56px"
                      className="object-contain p-1.5"
                    />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-semibold text-zinc-900">
                      Sign in to Headteacher Portal
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Use your EduLife OS account to see attendance pulses,
                      assessment trends and lesson supervision in one calm
                      interface.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Link
                    href={signInHref}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-black bg-black px-3 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-zinc-900"
                  >
                    Sign in
                  </Link>
                  <p className="text-[11px] text-zinc-500 text-center">
                    New school? Ask your system administrator to add you as a
                    headteacher in EduLife OS.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ---------- DEMO "SIGNED-IN" VIEW (calm workspace + classic link) ----------
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-zinc-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-4 md:space-y-6">
        {/* Calm Headteacher Portal workspace */}
        <HeadteacherPortalClient tenantId={tenantId} headUserId={headUserId} />

        {/* Classic dashboard hint */}
        <section className="rounded-2xl border border-zinc-200 bg-white/90 shadow-sm px-4 py-3 md:px-5 md:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[11px] md:text-xs text-zinc-700">
          <div className="space-y-1">
            <p className="font-semibold text-zinc-900">
              Need a more detailed, data-heavy view?
            </p>
            <p>
              Open the{" "}
              <span className="font-semibold">classic Headteacher Dashboard</span>{" "}
              to see expanded attendance, assessment and future fees views in
              one place.
            </p>
            <p className="text-[10px] text-zinc-500">
              In production, this link will be tied directly to your signed-in
              headteacher account.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/headteacher/dashboard?tenantId=${encodeURIComponent(
                tenantId
              )}&headUserId=${encodeURIComponent(headUserId)}`}
              className="inline-flex items-center justify-center rounded-xl border border-blue-700 bg-blue-700 px-3 py-1.5 text-[11px] md:text-xs font-medium text-white shadow-sm hover:bg-blue-800"
            >
              Go to classic Headteacher Dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

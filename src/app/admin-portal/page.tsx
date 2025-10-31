// src/app/admin-portal/page.tsx
import Image from "next/image";
import SignInForm from "@/components/SignInForm";

export default function AdminPortalPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-indigo-50 via-white to-indigo-50" />
        <div className="relative flex items-center gap-4 px-6 py-6">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <Image
              src="/portal.png"
              alt="Admin Portal"
              width={64}
              height={64}
              className="rounded-md object-cover"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-indigo-900">
              Admin Portal
            </h1>
            <p className="mt-1 text-gray-700">
              Central control for admissions, academics, users & roles, messaging, finance,
              and system settings.
            </p>
          </div>
        </div>
      </header>

      {/* Two-column: scope + sign in */}
      <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        {/* Scope / Responsibilities */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-indigo-800">Admin Responsibilities</h2>

          {/* Admissions */}
          <div className="mt-4">
            <h3 className="font-semibold text-gray-900">Admissions Management</h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              <li>Review new applications, approve/reject, and set student status.</li>
              <li>Configure entry requirements & prospectus (KG, Lower, Upper, JHS).</li>
              <li>View and export admitted students by level, term, and year.</li>
            </ul>
          </div>

          {/* Users & Roles */}
          <div className="mt-4">
            <h3 className="font-semibold text-gray-900">Users & Roles</h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              <li>Create and manage teacher, parent, student accounts.</li>
              <li>Assign roles & permissions (future: fine-grained Supabase RLS policies).</li>
              <li>Password reset & account recovery (email/WhatsApp workflows—Phase 2).</li>
            </ul>
          </div>

          {/* Academics */}
          <div className="mt-4">
            <h3 className="font-semibold text-gray-900">Academics & Classes</h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              <li>Manage classes, subjects, teacher assignments, timetables.</li>
              <li>Oversee assessments, CA entries, end-of-term reports & publishing.</li>
              <li>Attendance dashboards: daily summaries, late/absent alerts.</li>
            </ul>
          </div>

          {/* Communications */}
          <div className="mt-4">
            <h3 className="font-semibold text-gray-900">Communications & Notifications</h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              <li>WhatsApp broadcast templates (admissions, results, reminders).</li>
              <li>Queue & delivery logs with status (queued/sent/failed) & error details.</li>
              <li>Allow-list management for test numbers (sandbox) & move to production ID.</li>
            </ul>
          </div>

          {/* Finance */}
          <div className="mt-4">
            <h3 className="font-semibold text-gray-900">Finance</h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              <li>Fees & levies setup, dues (e.g., PTA dues), scholarships management.</li>
              <li>Payment links (Paystack/Hubtel), reconciliations & exports.</li>
              <li>Basic analytics: collections by class, term, outstanding balances.</li>
            </ul>
          </div>

          {/* Library/Content */}
          <div className="mt-4">
            <h3 className="font-semibold text-gray-900">Library & Content</h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              <li>Publish/update resources: textbooks, reading lists, homework packs.</li>
              <li>Manage news, events, gallery items (staff/students/SMC-PTA/MEO).</li>
            </ul>
          </div>

          {/* System */}
          <div className="mt-4">
            <h3 className="font-semibold text-gray-900">System Settings</h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              <li>School profile (motto, contacts, hours), term/academic year.</li>
              <li>Integrations: Supabase keys (server role), WhatsApp phone ID & token.</li>
              <li>Backups & exports (CSV), audit logs, and security posture.</li>
            </ul>
          </div>

          <p className="mt-5 text-sm text-gray-600">
            (Demo only — features will light up as we wire them to Supabase and the messaging API.)
          </p>
        </div>

        {/* Sign-in card with logo header */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Image
                src="/logo.png"
                alt="Ayitikope M/A Basic School"
                width={72}
                height={72}
                className="rounded-lg object-contain"
                priority
              />
              <div className="text-sm font-semibold text-indigo-900">
                Ayitikope M/A Basic School
              </div>
            </div>
          </div>

          <div className="flex items-start justify-center">
            <div className="w-full max-w-md">
              {/* For now reuse SignInForm with an allowed role to avoid TS errors */}
              <SignInForm role="teacher" />
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            Admin access is restricted. Contact the Headteacher for credentials.
          </p>
        </div>
      </section>
    </main>
  );
}

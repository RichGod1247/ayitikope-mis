// src/app/admin/tools/sms-center/page.tsx

"use client";

import Link from "next/link";

export default function SmsCenterPage() {
  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-4xl bg-white shadow-md rounded-xl p-6 border border-slate-200">
        <h1 className="text-2xl font-bold mb-2">
          EduLife OS – SMS Communication Center
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Central hub for managing all SMS-related tools in EduLife OS:
          contacts, broadcasts, diagnostics, attendance alerts, fees reminders,
          and audit logs.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Notification Contacts */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-1">
                Notification Contacts
              </h2>
              <p className="text-xs text-slate-600 mb-3">
                Manage who can receive system SMS messages: teachers, admins,
                and other key people. Activate/deactivate or edit contact
                details.
              </p>
            </div>
            <div>
              <Link
                href="/admin/tools/notification-contacts"
                className="inline-flex items-center rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5"
              >
                Open Notification Contacts
              </Link>
            </div>
          </div>

          {/* SMS Broadcast Console */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-1">
                SMS Broadcast Console
              </h2>
              <p className="text-xs text-slate-600 mb-3">
                Compose and send one-time SMS broadcasts to your configured
                contacts. Choose pilot mode or full mode, and select which
                brand/wallet to use.
              </p>
            </div>
            <div>
              <Link
                href="/admin/tools/sms-broadcast"
                className="inline-flex items-center rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5"
              >
                Open Broadcast Console
              </Link>
            </div>
          </div>

          {/* Attendance & Fees Demos */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-1">
                Attendance & Fees Demos
              </h2>
              <p className="text-xs text-slate-600 mb-3">
                Prototype tools for sending attendance alerts and fees
                reminders to parents/guardians. Currently manual entry; later
                this will be driven by real attendance and billing data.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/admin/tools/sms-attendance-demo"
                className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5"
              >
                Attendance Alerts Demo
              </Link>
              <Link
                href="/admin/tools/sms-fees-demo"
                className="inline-flex items-center rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5"
              >
                Fees Reminder Demo
              </Link>
            </div>
          </div>

          {/* SMS Logs */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-1">
                SMS Logs & Audit
              </h2>
              <p className="text-xs text-slate-600 mb-3">
                View the last 100 SMS messages sent by EduLife OS, including
                status codes, message IDs, and whether they were test or live
                messages.
              </p>
            </div>
            <div>
              <Link
                href="/admin/tools/sms-logs"
                className="inline-flex items-center rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5"
              >
                View SMS Logs
              </Link>
            </div>
          </div>

          {/* Diagnostics / Self-test */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-col justify-between md:col-span-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-1">
                Diagnostics & Self-test
              </h2>
              <p className="text-xs text-slate-600 mb-3">
                Use these endpoints to verify that Hubtel, wallets, and brand
                configurations are working correctly before sending important
                campaigns.
              </p>
              <ul className="text-xs text-slate-600 list-disc ml-4 space-y-1">
                <li>
                  <code>/api/sms/selftest</code> – quick engine self-test.
                </li>
                <li>
                  <code>/debug/sms-test</code> – pilot test to teacher
                  contacts.
                </li>
              </ul>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href="/api/sms/selftest"
                className="inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5"
              >
                Run Engine Self-test
              </Link>
              <Link
                href="/debug/sms-test"
                className="inline-flex items-center rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5"
              >
                Open Debug Test Page
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          <p>
            In future sprints, this Communication Center can include scheduled
            campaigns, parent portals, and automated flows triggered by
            attendance and billing events.
          </p>
        </div>
      </div>
    </main>
  );
}

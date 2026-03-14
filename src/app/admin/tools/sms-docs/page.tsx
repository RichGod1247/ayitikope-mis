// src/app/admin/tools/sms-docs/page.tsx

import Link from "next/link";

export default function SmsDocsPage() {
  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-4xl bg-white shadow-md rounded-xl p-6 border border-slate-200 space-y-6">
        <header>
          <h1 className="text-2xl font-bold mb-2">
            EduLife OS – SMS Engine Guide
          </h1>
          <p className="text-sm text-slate-600">
            This page documents how the SMS system in EduLife OS works:
            configuration, tools, endpoints, and troubleshooting. It is your{" "}
            <span className="font-semibold">operations manual</span> for
            Hubtel-based SMS.
          </p>
          <div className="mt-3 text-xs text-slate-500">
            <p>
              Quick links:{" "}
              <Link
                href="/admin/tools/sms-center"
                className="text-sky-600 hover:underline"
              >
                SMS Center
              </Link>{" "}
              ·{" "}
              <Link
                href="/admin/tools/notification-contacts"
                className="text-sky-600 hover:underline"
              >
                Notification Contacts
              </Link>{" "}
              ·{" "}
              <Link
                href="/admin/tools/sms-broadcast"
                className="text-sky-600 hover:underline"
              >
                Broadcast Console
              </Link>{" "}
              ·{" "}
              <Link
                href="/admin/tools/sms-attendance-demo"
                className="text-sky-600 hover:underline"
              >
                Attendance Demo
              </Link>{" "}
              ·{" "}
              <Link
                href="/admin/tools/sms-fees-demo"
                className="text-sky-600 hover:underline"
              >
                Fees Demo
              </Link>{" "}
              ·{" "}
              <Link
                href="/admin/tools/sms-logs"
                className="text-sky-600 hover:underline"
              >
                SMS Logs
              </Link>
            </p>
          </div>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            1. High-level architecture
          </h2>
          <p className="text-sm text-slate-600">
            The SMS system has three core layers:
          </p>
          <ol className="list-decimal ml-5 text-sm text-slate-600 space-y-1">
            <li>
              <span className="font-semibold">Engine:</span>{" "}
              <code className="bg-slate-100 px-1 rounded">
                src/lib/sms/hubtel.ts
              </code>{" "}
              — normalizes Ghana phone numbers, resolves sender brand, sends
              via Hubtel, and writes <code>SmsLog</code> entries.
            </li>
            <li>
              <span className="font-semibold">Wrapper:</span>{" "}
              <code className="bg-slate-100 px-1 rounded">
                src/lib/sms.ts
              </code>{" "}
              — generic helper for app-level SMS sending, auditing, and safe
              brand inference.
            </li>
            <li>
              <span className="font-semibold">APIs + Admin tools:</span>{" "}
              endpoints under <code>/api/sms/*</code>,{" "}
              <code>/api/admin/sms/*</code>, and pages under{" "}
              <code>/admin/tools</code> for broadcasts, demos, logs, and
              diagnostics.
            </li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            2. Brand model and default behavior
          </h2>
          <div className="text-sm text-slate-600 space-y-2">
            <p>The system supports these sender brands:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <code>EDULIFEOS</code> — the canonical default brand for generic
                platform SMS
              </li>
              <li>
                <code>AYITIKOPJHS</code> — JHS-specific wallet / sender
              </li>
              <li>
                <code>AYITIKPRIM</code> — Primary-specific wallet / sender
              </li>
              <li>
                <code>AYITIADMIN</code> — legacy backward-compatible brand,
                supported only where older flows still reference it
              </li>
            </ul>
            <p>
              Current recommended default: <code>EDULIFEOS</code>.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            3. Environment configuration (env.local)
          </h2>
          <p className="text-sm text-slate-600">
            These variables control provider selection, default brand behavior,
            and Hubtel credentials:
          </p>
          <ul className="list-disc ml-5 text-sm text-slate-600 space-y-1">
            <li>
              <code>SMS_PROVIDER</code>: should be set to <code>HUBTEL</code>.
            </li>
            <li>
              <code>HUBTEL_BASE_URL</code>: usually{" "}
              <code>https://smsc.hubtel.com</code>.
            </li>
            <li>
              <code>HUBTEL_DEFAULT_BRAND</code>: recommended default is{" "}
              <code>EDULIFEOS</code>.
            </li>
            <li>
              <code>HUBTEL_SENDER_ID</code>: generic sender fallback.
              Recommended value: <code>EduLifeOS</code>.
            </li>
            <li>
              Brand-specific credentials:
              <ul className="list-disc ml-5 space-y-1">
                <li>
                  <code>HUBTEL_EDULIFEOS_CLIENT_ID</code>,{" "}
                  <code>HUBTEL_EDULIFEOS_CLIENT_SECRET</code>,{" "}
                  <code>HUBTEL_EDULIFEOS_FROM</code>
                </li>
                <li>
                  <code>HUBTEL_AYITIKOPJHS_CLIENT_ID</code>,{" "}
                  <code>HUBTEL_AYITIKOPJHS_CLIENT_SECRET</code>,{" "}
                  <code>HUBTEL_AYITIKOPJHS_FROM</code>
                </li>
                <li>
                  <code>HUBTEL_AYITIKPRIM_CLIENT_ID</code>,{" "}
                  <code>HUBTEL_AYITIKPRIM_CLIENT_SECRET</code>,{" "}
                  <code>HUBTEL_AYITIKPRIM_FROM</code>
                </li>
                <li>
                  <code>HUBTEL_AYITIADMIN_CLIENT_ID</code>,{" "}
                  <code>HUBTEL_AYITIADMIN_CLIENT_SECRET</code>,{" "}
                  <code>HUBTEL_AYITIADMIN_FROM</code> (legacy support only)
                </li>
              </ul>
            </li>
            <li>
              <code>EDULIFE_SMS_SENDER</code>: optional backward-compatible
              sender setting. If present, keep it aligned with{" "}
              <code>EduLifeOS</code>.
            </li>
            <li>
              <code>TEST_SMS_TO</code>: phone number used by some test flows.
            </li>
            <li>
              <code>SMS_TEST_MODE</code>: when <code>true</code>, the engine can
              reroute live sends to the configured test number for safe testing.
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            After changing environment variables, restart{" "}
            <code>npm run dev</code> so Next.js picks up the new values.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            4. Key admin tools and typical flows
          </h2>
          <div className="space-y-3 text-sm text-slate-600">
            <div>
              <h3 className="font-semibold text-slate-800">
                4.1 Notification Contacts
              </h3>
              <p>
                <Link
                  href="/admin/tools/notification-contacts"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/notification-contacts
                </Link>
              </p>
              <p>
                Manage the list of people who can receive SMS from EduLife OS
                (teachers, admins, etc.).
              </p>
              <ul className="list-disc ml-5">
                <li>Add, edit, and deactivate contacts.</li>
                <li>Only active contacts are used by broadcast/debug tools.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                4.2 SMS Broadcast Console
              </h3>
              <p>
                <Link
                  href="/admin/tools/sms-broadcast"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/sms-broadcast
                </Link>
              </p>
              <ul className="list-disc ml-5">
                <li>Send to pilot group or all active contacts.</li>
                <li>
                  Use <code>EDULIFEOS</code> as the normal default sender.
                </li>
                <li>
                  JHS/Primary brands remain available where school-specific
                  routing is needed.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                4.3 Attendance Alerts Demo
              </h3>
              <p>
                <Link
                  href="/admin/tools/sms-attendance-demo"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/sms-attendance-demo
                </Link>
              </p>
              <ul className="list-disc ml-5">
                <li>Manual student and guardian entry for prototype testing.</li>
                <li>Logs each send into <code>SmsLog</code>.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                4.4 Fees Reminder Demo
              </h3>
              <p>
                <Link
                  href="/admin/tools/sms-fees-demo"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/sms-fees-demo
                </Link>
              </p>
              <ul className="list-disc ml-5">
                <li>Manual arrears testing flow.</li>
                <li>Logs each send into <code>SmsLog</code>.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">4.5 SMS Logs</h3>
              <p>
                <Link
                  href="/admin/tools/sms-logs"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/sms-logs
                </Link>
              </p>
              <ul className="list-disc ml-5">
                <li>Shows brand, recipient, status, and message snippet.</li>
                <li>
                  Failed sends can be retried through{" "}
                  <code>/api/admin/sms/resend/[id]</code>.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                4.6 Diagnostics and Self-test
              </h3>
              <ul className="list-disc ml-5">
                <li>
                  <code>/api/sms/selftest</code> — quick engine test.
                </li>
                <li>
                  <Link
                    href="/debug/sms-test"
                    className="text-sky-600 hover:underline"
                  >
                    /debug/sms-test
                  </Link>{" "}
                  — debug page for test sends and JSON inspection.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            5. Common errors and how to respond
          </h2>
          <div className="space-y-2 text-sm text-slate-600">
            <div>
              <p className="font-semibold text-slate-800">
                5.1 Invalid SenderId
              </p>
              <ul className="list-disc ml-5">
                <li>
                  Hubtel returns this if the sender name is not approved or does
                  not match the wallet credentials.
                </li>
                <li>
                  Check the corresponding <code>HUBTEL_*_FROM</code> value.
                </li>
                <li>
                  Confirm the chosen brand matches the wallet you intended to
                  use.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">
                5.2 Insufficient balance
              </p>
              <ul className="list-disc ml-5">
                <li>Means the selected wallet does not have enough funds.</li>
                <li>Top up the correct Hubtel wallet, then resend.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">
                5.3 Invalid phone number
              </p>
              <ul className="list-disc ml-5">
                <li>
                  Happens when numbers are empty, malformed, or not valid Ghana
                  mobile patterns.
                </li>
                <li>
                  The engine can normalize common Ghana formats, but completely
                  invalid strings will still fail.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">
                5.4 Missing environment variables
              </p>
              <ul className="list-disc ml-5">
                <li>
                  Verify required <code>HUBTEL_*</code> values in{" "}
                  <code>.env.local</code>.
                </li>
                <li>Restart the dev server after fixing env values.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            6. Roadmap – connecting to real data
          </h2>
          <p className="text-sm text-slate-600">
            The current tools already support real SMS sending via Hubtel and
            logging, but some flows still use manual data entry. Next steps:
          </p>
          <ul className="list-disc ml-5 text-sm text-slate-600 space-y-1">
            <li>Wire attendance alerts directly into the attendance records.</li>
            <li>
              Introduce structured fees/arrears campaigns from real billing
              data.
            </li>
            <li>
              Add analytics on top of <code>SmsLog</code> for volume, cost, and
              success rate by brand/purpose.
            </li>
          </ul>
        </section>

        <footer className="pt-2 border-t border-slate-200 mt-4 text-xs text-slate-500">
          <p>
            This page is part of EduLife OS internal documentation. Keep it
            aligned with the actual engine so future staff and developers do not
            inherit outdated operational assumptions.
          </p>
        </footer>
      </div>
    </main>
  );
}
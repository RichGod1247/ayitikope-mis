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

        {/* Section: Architecture */}
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
              – responsible for normalizing Ghana phone numbers, building
              Hubtel URLs, sending via Hubtel, and writing{" "}
              <code>SmsLog</code> entries.
            </li>
            <li>
              <span className="font-semibold">APIs:</span> endpoints under{" "}
              <code>/api/sms/*</code> and <code>/api/admin/sms/*</code> that
              call the engine for tests, broadcasts, attendance alerts, fees
              reminders, and resends.
            </li>
            <li>
              <span className="font-semibold">Admin tools:</span> pages under{" "}
              <code>/admin/tools</code> that let you manage contacts, run
              broadcasts, demos, and inspect logs without touching code.
            </li>
          </ol>
        </section>

        {/* Section: Environment */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            2. Environment configuration (env.local)
          </h2>
          <p className="text-sm text-slate-600">
            These variables control which provider is used and which Hubtel
            wallets/brands are active:
          </p>
          <ul className="list-disc ml-5 text-sm text-slate-600 space-y-1">
            <li>
              <code>SMS_PROVIDER</code> and{" "}
              <code>HARBOR_SMS_PROVIDER</code>: should be set to{" "}
              <code>HUBTEL</code>.
            </li>
            <li>
              <code>HUBTEL_BASE_URL</code>: usually{" "}
              <code>https://smsc.hubtel.com</code>.
            </li>
            <li>
              Brand credentials:
              <ul className="list-disc ml-5 space-y-1">
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
                  <code>HUBTEL_AYITIADMIN_FROM</code>
                </li>
              </ul>
            </li>
            <li>
              <code>EDULIFE_SMS_SENDER</code>: default brand/sender used by
              generic tools (e.g. <code>AyitiAdmin</code>).
            </li>
            <li>
              <code>TEST_SMS_TO</code>: phone number used by some test
              endpoints when no other number is provided.
            </li>
            <li>
              <code>SMS_TEST_MODE</code>: when <code>true</code>, some tools
              can override the actual destination for safe testing.
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            After changing environment variables, restart{" "}
            <code>npm run dev</code> so Next.js picks up the new values.
          </p>
        </section>

        {/* Section: Key admin pages */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            3. Key admin tools & typical flows
          </h2>
          <div className="space-y-3 text-sm text-slate-600">
            <div>
              <h3 className="font-semibold text-slate-800">
                3.1 Notification Contacts
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
                (teachers, admins, etc.). You can:
              </p>
              <ul className="list-disc ml-5">
                <li>Add, edit, and deactivate contacts.</li>
                <li>
                  Only active contacts are used by broadcast and debug tools.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                3.2 SMS Broadcast Console
              </h3>
              <p>
                <Link
                  href="/admin/tools/sms-broadcast"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/sms-broadcast
                </Link>
              </p>
              <p>
                Compose one-time messages (announcements, reminders) and send
                to:
              </p>
              <ul className="list-disc ml-5">
                <li>Pilot group (first 5 contacts) or all active contacts.</li>
                <li>
                  Choose which brand/wallet to use (Admin, JHS, Primary).
                </li>
                <li>
                  Each send is logged in <code>SmsLog</code> with purpose{" "}
                  <code>admin-broadcast</code>.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                3.3 Attendance Alerts Demo
              </h3>
              <p>
                <Link
                  href="/admin/tools/sms-attendance-demo"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/sms-attendance-demo
                </Link>
              </p>
              <p>
                Prototype sending attendance alerts to parents/guardians. Right
                now, you:
              </p>
              <ul className="list-disc ml-5">
                <li>Paste students and guardian numbers manually.</li>
                <li>
                  Send alerts with purpose{" "}
                  <code>attendance-alert-demo</code>.
                </li>
                <li>
                  Each SMS is logged and visible in{" "}
                  <code>/admin/tools/sms-logs</code>.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                3.4 Fees Reminder Demo
              </h3>
              <p>
                <Link
                  href="/admin/tools/sms-fees-demo"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/sms-fees-demo
                </Link>
              </p>
              <p>
                Prototype sending fees/arrears reminders. You:
              </p>
              <ul className="list-disc ml-5">
                <li>Specify term/period and class/form.</li>
                <li>
                  Paste lines like:{" "}
                  <code>John Doe - 024XXXXXXX - 150</code>.
                </li>
                <li>
                  Each SMS is logged with purpose{" "}
                  <code>fees-reminder-demo</code>.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">3.5 SMS Logs</h3>
              <p>
                <Link
                  href="/admin/tools/sms-logs"
                  className="text-sky-600 hover:underline"
                >
                  /admin/tools/sms-logs
                </Link>
              </p>
              <p>Shows the last 100 SMS entries with:</p>
              <ul className="list-disc ml-5">
                <li>Brand, to, purpose, status, rate, test/live flag.</li>
                <li>
                  Snippet of the message body for quick scanning.
                </li>
                <li>
                  <strong>Resend</strong> button for failed messages, which uses{" "}
                  <code>/api/admin/sms/resend/[id]</code> and logs with purpose{" "}
                  <code>resend-from-log</code>.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                3.6 Diagnostics & Self-test
              </h3>
              <ul className="list-disc ml-5">
                <li>
                  <code>/api/sms/selftest</code> – quick engine self-test to a
                  single number (often <code>TEST_SMS_TO</code>).
                </li>
                <li>
                  <Link
                    href="/debug/sms-test"
                    className="text-sky-600 hover:underline"
                  >
                    /debug/sms-test
                  </Link>{" "}
                  – debug page that can send to the configured teacher contacts
                  and show a JSON result.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section: Error handling */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            4. Common errors & how to respond
          </h2>
          <div className="space-y-2 text-sm text-slate-600">
            <div>
              <p className="font-semibold text-slate-800">
                4.1 Invalid SenderId
              </p>
              <ul className="list-disc ml-5">
                <li>
                  Hubtel returns this if the <code>FROM</code> name is not
                  approved or doesn&apos;t match the configured account.
                </li>
                <li>
                  Check <code>HUBTEL_*_FROM</code> values and ensure they
                  match what Hubtel has approved.
                </li>
                <li>
                  Verify you used the correct brand (Admin, JHS, Primary) for
                  that wallet.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">
                4.2 Insufficient balance
              </p>
              <ul className="list-disc ml-5">
                <li>
                  Means the chosen Hubtel wallet doesn&apos;t have enough
                  funds.
                </li>
                <li>
                  Top up the appropriate wallet (Admin/JHS/Primary) in Hubtel,
                  then resend from logs or re-run the campaign.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">
                4.3 Invalid &apos;to&apos; phone number
              </p>
              <ul className="list-disc ml-5">
                <li>
                  Occurs when numbers are empty, malformed, or not valid Ghana
                  mobile patterns.
                </li>
                <li>
                  Check the source (notification contacts, attendance demo,
                  fees demo) and correct any numbers that don&apos;t start
                  with <code>0</code> or <code>233</code>.
                </li>
                <li>
                  The engine normalizes numbers like <code>024...</code> into{" "}
                  <code>23324...</code>, but completely invalid strings
                  will still fail.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">
                4.4 Missing environment variables
              </p>
              <ul className="list-disc ml-5">
                <li>
                  If you see logs like{" "}
                  <code>[HUBTEL] One or more env vars are missing</code>,
                  verify all required <code>HUBTEL_*</code> variables in{" "}
                  <code>.env.local</code>.
                </li>
                <li>Restart the dev server after fixing env values.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section: Roadmap */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-800">
            5. Roadmap – connecting to real data
          </h2>
          <p className="text-sm text-slate-600">
            The current tools already support real SMS sending via Hubtel and
            logging, but some flows still use manual data entry (attendance
            and fees demos). Next steps in future sprints:
          </p>
          <ul className="list-disc ml-5 text-sm text-slate-600 space-y-1">
            <li>
              Wire attendance alerts directly to the attendance records in
              the MIS (daily parent alerts).
            </li>
            <li>
              Introduce a structured fees/arrears data model and generate
              reminder campaigns automatically.
            </li>
            <li>
              Add analytics on top of <code>SmsLog</code> (volume, cost per
              brand, success rate per purpose).
            </li>
          </ul>
        </section>

        {/* Footer */}
        <footer className="pt-2 border-t border-slate-200 mt-4 text-xs text-slate-500">
          <p>
            This page is part of EduLife OS&apos;s internal documentation. As
            the system grows, update it so future staff and developers can
            understand and operate the SMS engine confidently.
          </p>
        </footer>
      </div>
    </main>
  );
}

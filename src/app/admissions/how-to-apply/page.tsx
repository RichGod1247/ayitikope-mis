// src/app/admissions/how-to-apply/page.tsx
export const metadata = { title: "How to Apply • Admissions" };
export const dynamic = "force-dynamic";

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
          {n}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-blue-800">{title}</h3>
          <div className="mt-2 text-gray-700">{children}</div>
        </div>
      </div>
    </article>
  );
}

export default function HowToApplyPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-blue-800">Admissions — How to Apply</h1>
        <p className="mt-2 text-gray-700 max-w-3xl">
          Follow these simple steps to submit an application for <strong>KG</strong>,{" "}
          <strong>Primary</strong>, or <strong>JHS</strong>. You’ll get WhatsApp updates
          when your application is received and reviewed.
        </p>
      </header>

      <section className="grid gap-4">
        <Step n={1} title="Gather Required Details">
          <ul className="list-disc pl-5 space-y-1">
            <li>Student’s full name and <strong>Date of Birth</strong></li>
            <li>Gender</li>
            <li>Parent/Guardian name and <strong>primary phone (WhatsApp)</strong></li>
            <li>House number (optional) &amp; GhanaPost GPS (optional)</li>
            <li>Applying level: <em>KG / Primary / JHS</em></li>
          </ul>
        </Step>

        <Step n={2} title="Complete the Online Form">
          <p>
            Fill the secure online form. It takes about 3–5 minutes.
            Be sure to provide a working WhatsApp number for updates.
          </p>
          <a
            href="/admissions/apply"
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800"
          >
            Apply Online
          </a>
        </Step>

        <Step n={3} title="Wait for Review & Confirmation">
          <p>
            Our team reviews applications on a rolling basis. You will receive a
            WhatsApp notification once your application is <em>Accepted</em> or if more
            information is needed.
          </p>
        </Step>

        <Step n={4} title="Prepare PTA & Prospectus Items">
          <p>
            After acceptance, kindly prepare required items on the{" "}
            <a href="/admissions/prospectus" className="text-blue-700 underline">
              Prospectus
            </a>{" "}
            and note that PTA dues of <strong>GHS 20</strong> apply across board. For fee
            details and payment link, see{" "}
            <a href="/admissions/fees" className="text-blue-700 underline">
              Fees &amp; Levies
            </a>
            .
          </p>
        </Step>

        <Step n={5} title="Report on the Stated Date">
          <p>
            Check the{" "}
            <a href="/admissions/dates" className="text-blue-700 underline">
              Key Dates
            </a>{" "}
            for uniform fitting / PTA registration windows and the reporting day.
          </p>
        </Step>
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-blue-800">Which level should I choose?</h2>
          <ul className="mt-2 list-disc pl-5 text-gray-700 space-y-1">
            <li><strong>KG</strong>: Typically ages 4–5.</li>
            <li><strong>Primary</strong>: Lower (B1–B3) and Upper (B4–B6).</li>
            <li><strong>JHS</strong>: JHS1–JHS3.</li>
          </ul>
          <p className="mt-2 text-sm text-gray-600">
            Unsure? Use the notes in the{" "}
            <a href="/admissions/entry" className="text-blue-700 underline">Entry Requirements</a>.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-blue-800">Need Help?</h2>
          <p className="mt-2 text-gray-700">
            Have questions before applying? Reach out via our{" "}
            <a href="/contact" className="text-blue-700 underline">Contact</a>{" "}
            page or speak to the Headteacher’s office.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            We’re here to guide you through the process.
          </p>
        </div>
      </section>
    </main>
  );
}

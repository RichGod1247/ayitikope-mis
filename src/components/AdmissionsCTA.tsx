import Link from "next/link";

export default function AdmissionsCTA() {
  return (
    <section className="mt-12 rounded-2xl border bg-gradient-to-br from-blue-50 to-white p-6 sm:p-10 shadow-sm">
      <div className="grid gap-6 sm:grid-cols-[1.5fr_1fr] items-center">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-blue-800">
            Admissions Open — KG • Primary • JHS
          </h2>
          <p className="mt-2 text-gray-700 max-w-2xl">
            Start your child’s journey with a values-driven education that blends
            strong academics with character and service.
          </p>
          <ul className="mt-4 grid gap-2 text-gray-700">
            <li>• Simple online form (KG, Primary, JHS)</li>
            <li>• WhatsApp updates to parents</li>
            <li>• Caring teachers & safe environment</li>
          </ul>

          <div className="mt-6 flex gap-3">
            <Link
              href="/contact#apply"
              className="rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 font-semibold shadow"
            >
              Apply Now
            </Link>
            <Link
              href="/contact"
              className="rounded-lg bg-white hover:bg-gray-50 text-blue-700 px-6 py-3 font-semibold shadow border"
            >
              Ask a Question
            </Link>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h3 className="font-semibold text-blue-800">What you’ll need</h3>
          <ul className="mt-2 space-y-2 text-sm text-gray-700">
            <li>• Student’s name & date of birth</li>
            <li>• Parent/Guardian name & phone</li>
            <li>• House number & GhanaPost GPS</li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            (We’ll add the full online admissions form soon.)
          </p>
        </div>
      </div>
    </section>
  );
}

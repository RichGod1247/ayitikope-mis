// src/app/headteacher/consent/letters/teacher/[userId]/page.tsx
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function logoSrc(slug?: string | null) {
  if (!slug) return '/logos/default.png'
  return `/logos/${slug}.png`
}

export default async function TeacherConsentLetterPage(
  props: { params: Promise<{ userId: string }> }
) {
  const { userId } = await props.params

  // Get teacher + any membership to read tenant (name/slug)
  const membership = await prisma.membership.findFirst({
    where: { userId },
    select: {
      user: { select: { id: true, name: true, email: true, smsOptIn: true } },
      tenant: { select: { id: true, name: true, slug: true } },
    },
  })

  const teacher = membership?.user
  const tenant = membership?.tenant

  return (
    <div className="mx-auto max-w-[794px] p-6">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-4 mb-6">
        <img
          src={logoSrc(tenant?.slug)}
          alt={tenant?.name || 'School Logo'}
          className="h-14 w-14 object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold">
            {tenant?.name || 'Your School Name'}
          </h1>
          <p className="text-sm text-gray-500">
            Health & Communications Consent — Teacher
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-5 leading-7">
        {!teacher ? (
          <div className="border rounded-lg p-6 text-center text-red-600">
            Teacher not found.
          </div>
        ) : (
          <>
            <p>Dear {teacher.name || 'Teacher'},</p>

            <p>
              This letter outlines our policy regarding teacher well-being and
              optional SMS/WhatsApp notifications. We kindly ask you to review
              and confirm whether you consent to receive communication related
              to school operations, schedules, attendance analytics, and health
              & wellness initiatives.
            </p>

            <div className="rounded-md border p-4 bg-gray-50 text-sm">
              <div><span className="font-medium">Teacher:</span> {teacher.name || '—'}</div>
              <div><span className="font-medium">Email:</span> {teacher.email || '—'}</div>
              <div><span className="font-medium">Current SMS Opt-in:</span> {teacher.smsOptIn ? 'Yes' : 'No'}</div>
              <div><span className="font-medium">School:</span> {tenant?.name || '—'}</div>
            </div>

            <h2 className="text-lg font-semibold">What you’re consenting to</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Receiving school announcements and staff notices by SMS/WhatsApp.</li>
              <li>Receiving optional well-being nudges and professional growth prompts.</li>
              <li>You may opt-out at any time by informing the Head Teacher.</li>
            </ul>

            <h2 className="text-lg font-semibold">Signature & Confirmation</h2>
            <p>
              By signing below or replying “YES” to the school’s consent message,
              you indicate your approval to receive the above communications.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-6">
              <div className="border-t pt-4">
                <div className="text-sm text-gray-500">Teacher Signature</div>
              </div>
              <div className="border-t pt-4">
                <div className="text-sm text-gray-500">Date</div>
              </div>
            </div>

            <p className="text-sm text-gray-500 mt-8">
              If you have questions, please contact the Head Teacher.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

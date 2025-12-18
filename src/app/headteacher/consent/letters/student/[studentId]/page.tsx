// src/app/headteacher/consent/letters/student/[studentId]/page.tsx
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ studentId: string }>
}

export default async function StudentConsentLetterPage(props: PageProps) {
  const { studentId } = await props.params

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      healthConsentAt: true,
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
  })

  if (!student) {
    return (
      <div className="p-6 text-red-600">
        Student not found.
      </div>
    )
  }

  const fullName = [student.firstName, student.lastName].filter(Boolean).join(' ')
  const tenantName = student.tenant?.name ?? 'School'
  const tenantSlug = student.tenant?.slug ?? 'default'
  const logoSrc = `/logos/${tenantSlug}.png`

  return (
    <div className="p-6">
      {/* A4-friendly container */}
      <div className="mx-auto w-full max-w-[800px] bg-white shadow-sm border rounded-xl p-8 print:shadow-none print:border-0 print:p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <div className="flex items-center gap-3">
            {/* Logo (no onError in Server Component) */}
            <img
              src={logoSrc}
              alt={`${tenantName} logo`}
              className="h-12 w-auto"
            />
            <div>
              <div className="text-lg font-semibold">{tenantName}</div>
              <div className="text-xs text-zinc-600">
                Guardian Consent &amp; SMS Opt-in Letter
              </div>
            </div>
          </div>

          <div className="text-right text-xs text-zinc-500">
            Generated on {new Date().toLocaleDateString()}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 text-[0.95rem] leading-6">
          <p>
            Dear {student.guardianName ?? 'Parent/Guardian'},
          </p>
          <p>
            This letter documents the health data consent and SMS communication preference
            for your ward, <strong>{fullName}</strong>. With your consent, the school may
            record daily health entries (e.g., temperature and symptoms during school days)
            to support student well-being.
          </p>

          <div className="rounded-lg border p-4 bg-zinc-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-zinc-500">Student:</span> <strong>{fullName}</strong></div>
              <div><span className="text-zinc-500">Guardian:</span> <strong>{student.guardianName ?? '—'}</strong></div>
              <div><span className="text-zinc-500">Phone:</span> <strong>{student.guardianPhone ?? '—'}</strong></div>
              <div><span className="text-zinc-500">Consent Date:</span> <strong>{student.healthConsentAt ? new Date(student.healthConsentAt).toLocaleDateString() : '—'}</strong></div>
            </div>
          </div>

          <p>
            By opting into SMS notifications, you agree to receive messages related to your
            ward’s attendance or health alerts. Standard carrier rates may apply.
          </p>

          <p className="mt-6">
            Sincerely,<br />
            <strong>{tenantName}</strong>
          </p>
        </div>

        {/* Print controls */}
        <div className="mt-8 hidden print:block text-center text-xs text-zinc-500">
          — End of Letter —
        </div>
      </div>
    </div>
  )
}

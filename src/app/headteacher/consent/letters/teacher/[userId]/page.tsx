// src/app/headteacher/consent/letters/teacher/[userId]/page.tsx
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ userId: string }>
}

export default async function TeacherConsentLetterPage(props: PageProps) {
  const { userId } = await props.params

  // Load teacher + their first tenant (via membership)
  const teacher = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      smsOptIn: true,
      memberships: {
        select: {
          tenant: { select: { id: true, name: true, slug: true } },
          status: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  })

  if (!teacher) {
    return (
      <div className="p-6 text-red-600">
        Teacher not found.
      </div>
    )
  }

  const tenant = teacher.memberships[0]?.tenant
  const tenantName = tenant?.name ?? 'School'
  const tenantSlug = tenant?.slug ?? 'default'
  const logoSrc = `/logos/${tenantSlug}.png`

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-[800px] bg-white shadow-sm border rounded-xl p-8 print:shadow-none print:border-0 print:p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <div className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt={`${tenantName} logo`}
              className="h-12 w-auto"
            />
            <div>
              <div className="text-lg font-semibold">{tenantName}</div>
              <div className="text-xs text-zinc-600">
                Teacher SMS Opt-in Letter
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
            Dear <strong>{teacher.name ?? 'Teacher'}</strong>,
          </p>
          <p>
            This letter documents your SMS communication preference with <strong>{tenantName}</strong>.
            By opting in, you agree to receive messages related to school operations (e.g., attendance
            summaries, health reminders, or official announcements). Standard carrier rates may apply.
          </p>

          <div className="rounded-lg border p-4 bg-zinc-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-zinc-500">Name:</span> <strong>{teacher.name ?? '—'}</strong></div>
              <div><span className="text-zinc-500">Email:</span> <strong>{teacher.email ?? '—'}</strong></div>
              <div><span className="text-zinc-500">SMS Opt-in:</span> <strong>{teacher.smsOptIn ? 'Yes' : 'No'}</strong></div>
            </div>
          </div>

          <p className="mt-6">
            Sincerely,<br />
            <strong>{tenantName}</strong>
          </p>
        </div>

        <div className="mt-8 hidden print:block text-center text-xs text-zinc-500">
          — End of Letter —
        </div>
      </div>
    </div>
  )
}

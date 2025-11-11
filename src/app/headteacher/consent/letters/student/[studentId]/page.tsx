// src/app/headteacher/consent/letters/student/[studentId]/page.tsx
'use client'
import { useEffect, useState } from 'react'

type Student = {
  id: string
  firstName: string | null
  lastName: string | null
  guardianName: string | null
  guardianPhone: string | null
  healthConsentAt: string | null
  guardianSmsOptIn: boolean | null
  classroom?: { grade: string | null; arm: string | null; name: string }
}

export default function StudentConsentLetter({ params }: { params: { studentId: string } }) {
  const [tenantName, setTenantName] = useState<string>('School')
  const [s, setS] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        // tenant
        const t = await fetch('/api/test/tenants').then(r => r.json())
        const first = t?.tenants?.[0]
        if (first?.name) setTenantName(first.name)

        // student
        const res = await fetch(`/api/consent/students/detail?studentId=${params.studentId}`)
        const data = await res.json()
        setS(data?.student ?? null)
      } finally {
        setLoading(false)
      }
    })()
  }, [params.studentId])

  if (loading) return <div className="p-6">Loading...</div>
  if (!s) return <div className="p-6 text-red-600">Student not found.</div>

  const classLabel = s.classroom
    ? (s.classroom.grade ? `${s.classroom.grade}${s.classroom.arm ?? ''}` : s.classroom.name)
    : ''

  return (
    <div className="max-w-[800px] mx-auto p-8 print:p-0">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tenantName}</h1>
        <button
          onClick={() => window.print()}
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 print:hidden"
        >
          Print / Save as PDF
        </button>
      </div>

      <h2 className="text-xl font-semibold mb-2">Parent/Guardian Consent Letter</h2>
      <p className="text-sm text-gray-600 mb-6">Student daily health + SMS notifications</p>

      <div className="space-y-1 text-sm">
        <div><span className="font-semibold">Student:</span> {s.firstName} {s.lastName}</div>
        <div><span className="font-semibold">Class:</span> {classLabel}</div>
        <div><span className="font-semibold">Guardian:</span> {s.guardianName ?? '-'}</div>
        <div><span className="font-semibold">Guardian Phone:</span> {s.guardianPhone ?? '-'}</div>
        <div><span className="font-semibold">Consent recorded:</span> {s.healthConsentAt ? new Date(s.healthConsentAt).toLocaleString() : '—'}</div>
        <div><span className="font-semibold">SMS Opt-in:</span> {s.guardianSmsOptIn ? 'Yes' : 'No'}</div>
      </div>

      <hr className="my-6" />

      <p className="text-sm leading-6">
        Dear Parent/Guardian, <br />
        We respectfully request your consent to collect and securely process your child’s basic health
        indicators (e.g., temperature, reported symptoms) for the purpose of wellness support and to
        notify you via SMS when relevant. Data is kept confidential, used only by authorized staff, and
        aligned with Ghana’s Data Protection Act (2012). You may withdraw consent at any time.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <div className="h-24 border rounded-lg" />
          <div className="text-xs mt-2 text-gray-600">Parent/Guardian Signature &amp; Date</div>
        </div>
        <div>
          <div className="h-24 border rounded-lg" />
          <div className="text-xs mt-2 text-gray-600">School Representative Signature &amp; Date</div>
        </div>
      </div>

      <style>{`
        @media print {
          button { display: none; }
          body { background: white; }
        }
      `}</style>
    </div>
  )
}

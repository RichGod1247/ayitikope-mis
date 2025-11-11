'use client'
import { useEffect, useState } from 'react'

type Teacher = {
  id: string
  name: string | null
  email: string | null
  smsOptIn: boolean | null
}

export default function TeacherConsentLetter({ params }: { params: { userId: string } }) {
  const [tenantName, setTenantName] = useState('School')
  const [t, setT] = useState<Teacher | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const ten = await fetch('/api/test/tenants').then(r => r.json())
        if (ten?.tenants?.[0]?.name) setTenantName(ten.tenants[0].name)

        const res = await fetch(`/api/consent/teachers/detail?userId=${params.userId}`)
        const data = await res.json()
        setT(data?.user ?? null)
      } finally {
        setLoading(false)
      }
    })()
  }, [params.userId])

  if (loading) return <div className="p-6">Loading...</div>
  if (!t) return <div className="p-6 text-red-600">Teacher not found.</div>

  return (
    <div className="max-w-[800px] mx-auto p-8 bg-white">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tenantName}</h1>
        <button
          onClick={() => window.print()}
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 print:hidden"
        >
          Print / Save as PDF
        </button>
      </div>

      <h2 className="text-xl font-semibold mb-2">Staff SMS Consent Letter</h2>
      <p className="text-sm text-gray-600 mb-6">Weekly wellbeing check-ins & notifications</p>

      <div className="space-y-1 text-sm">
        <div><span className="font-semibold">Name:</span> {t.name}</div>
        <div><span className="font-semibold">Email:</span> {t.email}</div>
        <div><span className="font-semibold">SMS Opt-in:</span> {t.smsOptIn ? 'Yes' : 'No'}</div>
      </div>

      <hr className="my-6" />

      <p className="text-sm leading-6">
        Dear Staff, <br />
        We invite you to opt-in to receive weekly wellbeing reminders (stress/workload check-ins) via SMS
        and allow us to store your responses for internal wellness support. Data is confidential and aligned
        with Ghana’s Data Protection Act (2012). You may opt out at any time.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <div className="h-24 border rounded-lg" />
          <div className="text-xs mt-2 text-gray-600">Staff Signature &amp; Date</div>
        </div>
        <div>
          <div className="h-24 border rounded-lg" />
          <div className="text-xs mt-2 text-gray-600">School Representative Signature &amp; Date</div>
        </div>
      </div>
    </div>
  )
}

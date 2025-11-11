// src/app/headteacher/consent/audit/page.tsx
'use client'
import { useEffect, useState } from 'react'

type AuditItem = {
  id: string
  createdAt: string
  kind: 'STUDENT_HEALTH' | 'TEACHER_REMINDER' | string
  phone: string | null
  message: string
  meta: any
}

export default function ConsentAuditPage() {
  const [tenantId, setTenantId] = useState<string>('')
  const [kind, setKind] = useState<string>('') // filter
  const [items, setItems] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      const t = await fetch('/api/test/tenants').then(r => r.json())
      const first = t?.tenants?.[0]
      if (first?.id) setTenantId(first.id)
    })()
  }, [])

  async function load() {
    if (!tenantId) return
    setLoading(true)
    try {
      const u = `/api/consent/audit/list?tenantId=${tenantId}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`
      const data = await fetch(u).then(r => r.json())
      setItems(data?.items ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tenantId, kind]) // auto-load

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">SMS Audit</h1>
        <select
          value={kind}
          onChange={e => setKind(e.target.value)}
          className="border rounded-lg px-2 py-1 text-sm"
        >
          <option value="">All kinds</option>
          <option value="STUDENT_HEALTH">Student Health SMS</option>
          <option value="TEACHER_REMINDER">Teacher Reminder SMS</option>
        </select>
        <button onClick={load} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50">
          Refresh
        </button>
      </div>

      <div className="overflow-auto border rounded-xl">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-2">Time</th>
              <th className="p-2">Kind</th>
              <th className="p-2">Phone</th>
              <th className="p-2">Message</th>
              <th className="p-2">Meta</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-3 text-gray-500" colSpan={5}>Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td className="p-3 text-gray-500" colSpan={5}>No audit entries.</td></tr>
            )}
            {!loading && items.map(a => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="p-2">{a.kind}</td>
                <td className="p-2">{a.phone ?? '—'}</td>
                <td className="p-2 whitespace-pre-wrap">{a.message}</td>
                <td className="p-2">
                  <pre className="text-xs whitespace-pre-wrap wrap-break-word">
                    {a.meta ? JSON.stringify(a.meta, null, 2) : '—'}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500">
        Note: All SMS sends are logged here (kind, message body, and metadata) for accountability and compliance.
      </div>
    </div>
  )
}

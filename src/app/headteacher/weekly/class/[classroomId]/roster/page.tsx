// src/app/headteacher/weekly/class/[classroomId]/roster/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

type Row = {
  studentId: string
  fullName: string
  guardianName: string
  guardianPhone: string
  sessions: number
  present: number
  absent: number
  late: number
  excused: number
  noMark: number
  pctPresent: number
}

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`

export default function WeeklyClassRosterPage() {
  const params = useParams<{ classroomId: string }>()
  const qs = useSearchParams()
  const classroomId = params.classroomId

  const [tenantId, setTenantId] = useState('')
  const [start, setStart] = useState(qs.get('start') || '')
  const [end, setEnd] = useState(qs.get('end') || '')
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function todayYYYYMMDD() { const now = new Date(); return now.toISOString().slice(0, 10) }
  function weekRangeMonFri(dStr?: string) {
    const base = dStr && dStr.trim() ? new Date(dStr) : new Date()
    const day = base.getUTCDay()
    const diffToMon = (day + 6) % 7
    const monday = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()))
    monday.setUTCDate(monday.getUTCDate() - diffToMon)
    const friday = new Date(monday); friday.setUTCDate(friday.getUTCDate() + 4)
    const toISO = (d: Date) => d.toISOString().slice(0, 10)
    return { start: toISO(monday), end: toISO(friday) }
  }

  useEffect(() => {
    fetch('/api/test/tenants')
      .then(r => r.json())
      .then(d => {
        const t = (d?.tenants && d.tenants[0]) || null
        if (t?.id) setTenantId(t.id)
        const { start, end } = weekRangeMonFri(qs.get('date') ?? todayYYYYMMDD())
        if (!qs.get('start')) setStart(start)
        if (!qs.get('end')) setEnd(end)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId])

  async function load() {
    if (!tenantId || !classroomId || !start || !end) { setMsg('Missing inputs'); return }
    setLoading(true); setMsg(null)
    try {
      const url = `/api/headteacher/weekly/class-roster?tenantId=${encodeURIComponent(tenantId)}&classroomId=${encodeURIComponent(classroomId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      const res = await fetch(url)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data?.error || `Failed to load (${res.status})`); setRows([]); return }
      setRows((data?.items || []) as Row[])
    } finally {
      setLoading(false)
    }
  }

  const exportURL = useMemo(() => {
    if (!tenantId || !start || !end) return ''
    return `/api/headteacher/export-csv-range?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  }, [tenantId, start, end])

  function pctClass(p: number) {
    if (p >= 90) return 'text-emerald-700'
    if (p >= 75) return 'text-amber-700'
    return 'text-red-700'
  }

  const defaultWeek = weekRangeMonFri(todayYYYYMMDD())

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Weekly Class Roster (Mon–Fri)</h1>
      <p className="text-sm text-zinc-600">Per-student roll-up for this class and week.</p>

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Start (Mon)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10"
              value={start} onChange={e => setStart(e.target.value)} placeholder={defaultWeek.start} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setStart(defaultWeek.start)}>This Mon</button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End (Fri)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10"
              value={end} onChange={e => setEnd(e.target.value)} placeholder={defaultWeek.end} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setEnd(defaultWeek.end)}>This Fri</button>
          </div>
        </div>
        <div className="flex items-end">
          <button className={btnPrimary + ' w-full'} onClick={load} disabled={loading || !tenantId || !start || !end}>
            {loading ? 'Loading…' : 'Load Week'}
          </button>
        </div>
        <div className="flex items-end">
          <a className={`${btnOutline} w-full ${exportURL ? '' : 'pointer-events-none opacity-50'}`} href={exportURL}>
            Download School CSV (Mon–Fri)
          </a>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border rounded-xl overflow-hidden">
          <thead className="bg-zinc-50">
            <tr className="text-left text-sm text-zinc-600">
              <th className="p-3 border-b">Student</th>
              <th className="p-3 border-b">Guardian</th>
              <th className="p-3 border-b">Phone</th>
              <th className="p-3 border-b">Sessions</th>
              <th className="p-3 border-b">Present</th>
              <th className="p-3 border-b">Absent</th>
              <th className="p-3 border-b">Late</th>
              <th className="p-3 border-b">Excused</th>
              <th className="p-3 border-b">No Mark</th>
              <th className="p-3 border-b">% Present</th>
              <th className="p-3 border-b">Profile</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.studentId} className="text-sm">
                <td className="p-3 border-b font-semibold">{r.fullName}</td>
                <td className="p-3 border-b">{r.guardianName}</td>
                <td className="p-3 border-b">{r.guardianPhone}</td>
                <td className="p-3 border-b">{r.sessions}</td>
                <td className="p-3 border-b">{r.present}</td>
                <td className="p-3 border-b">{r.absent}</td>
                <td className="p-3 border-b">{r.late}</td>
                <td className="p-3 border-b">{r.excused}</td>
                <td className="p-3 border-b">{r.noMark}</td>
                <td className={`p-3 border-b font-semibold ${pctClass(r.pctPresent)}`}>{r.pctPresent}%</td>
                <td className="p-3 border-b">
                  <a
                    className="underline decoration-dotted hover:decoration-solid"
                    href={`/headteacher/student/${encodeURIComponent(r.studentId)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}
                    title="Open student profile for this week"
                  >
                    View
                  </a>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td className="p-4 text-sm text-zinc-600" colSpan={11}>No data yet — choose dates and Load Week.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}

      <div className="flex gap-3">
        <a className={btnOutline} href={`/headteacher/weekly/class/${encodeURIComponent(classroomId)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}>← Back to Class Days</a>
        <a className={btnOutline} href="/headteacher/weekly">← Back to Weekly Overview</a>
      </div>
    </div>
  )
}

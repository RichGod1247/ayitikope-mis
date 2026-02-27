// src/app/headteacher/student/[studentId]/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { fetchActiveTenant } from '@/lib/client/activeTenant'

type Item = { date: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'NO_MARK'; note: string }

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`

export default function StudentDetailPage() {
  const params = useParams<{ studentId: string }>()
  const qs = useSearchParams()
  const studentId = params.studentId

  const [tenantId, setTenantId] = useState('')
  const [start, setStart] = useState(qs.get('start') || '')
  const [end, setEnd] = useState(qs.get('end') || '')
  const [items, setItems] = useState<Item[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [fullName, setFullName] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [sessions, setSessions] = useState(0)
  const [present, setPresent] = useState(0)
  const [absent, setAbsent] = useState(0)
  const [late, setLate] = useState(0)
  const [excused, setExcused] = useState(0)
  const [noMark, setNoMark] = useState(0)
  const [pctPresent, setPctPresent] = useState(0)

  function todayYYYYMMDD() {
    const now = new Date()
    return now.toISOString().slice(0, 10)
  }
  function weekRangeMonFri(dStr?: string) {
    const base = dStr && dStr.trim() ? new Date(dStr) : new Date()
    const day = base.getUTCDay()
    const diffToMon = (day + 6) % 7
    const monday = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()))
    monday.setUTCDate(monday.getUTCDate() - diffToMon)
    const friday = new Date(monday)
    friday.setUTCDate(friday.getUTCDate() + 4)
    const toISO = (d: Date) => d.toISOString().slice(0, 10)
    return { start: toISO(monday), end: toISO(friday) }
  }

  useEffect(() => {
    ;(async () => {
      const t = await fetchActiveTenant()
      if (t?.id) setTenantId(t.id)

      const { start: s, end: e } = weekRangeMonFri(qs.get('date') ?? todayYYYYMMDD())
      if (!qs.get('start')) setStart(s)
      if (!qs.get('end')) setEnd(e)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  async function load() {
    if (!studentId || !start || !end)
 {
      setMsg('Missing inputs')
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      const url = `/api/headteacher/student/detail?studentId=${encodeURIComponent(
  studentId
)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(data?.error || `Failed to load (${res.status})`)
        setItems([])
        return
      }

      setFullName(data?.meta?.fullName || '')
      setGuardianName(data?.meta?.guardianName || '')
      setGuardianPhone(data?.meta?.guardianPhone || '')
      setSessions(data?.meta?.sessions || 0)
      setPresent(data?.meta?.present || 0)
      setAbsent(data?.meta?.absent || 0)
      setLate(data?.meta?.late || 0)
      setExcused(data?.meta?.excused || 0)
      setNoMark(data?.meta?.noMark || 0)
      setPctPresent(data?.meta?.pctPresent || 0)
      setItems((data?.items || []) as Item[])
    } finally {
      setLoading(false)
    }
  }

  const exportURL = useMemo(() => {
    if (!tenantId || !start || !end) return ''
    return `/api/headteacher/export-csv-range?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(
      start
    )}&end=${encodeURIComponent(end)}`
  }, [tenantId, start, end])

  function badge(status: Item['status']) {
    const base = 'text-xs px-2 py-1 rounded-full border'
    if (status === 'PRESENT') return `${base} bg-emerald-50 border-emerald-200 text-emerald-900`
    if (status === 'ABSENT') return `${base} bg-red-50 border-red-200 text-red-900`
    if (status === 'LATE') return `${base} bg-amber-50 border-amber-200 text-amber-900`
    if (status === 'EXCUSED') return `${base} bg-indigo-50 border-indigo-200 text-indigo-900`
    return `${base} bg-gray-50 border-gray-200 text-gray-900`
  }

  const defaultWeek = weekRangeMonFri(todayYYYYMMDD())

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Student Profile — Weekly Attendance</h1>
      <p className="text-sm text-zinc-600">
        <b>{fullName || 'Student'}</b> — Guardian: {guardianName || '—'} ({guardianPhone || '—'})
      </p>

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Start (Mon)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10" value={start} onChange={(e) => setStart(e.target.value)} placeholder={defaultWeek.start} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setStart(defaultWeek.start)}>
              This Mon
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End (Fri)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10" value={end} onChange={(e) => setEnd(e.target.value)} placeholder={defaultWeek.end} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setEnd(defaultWeek.end)}>
              This Fri
            </button>
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

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
        <div className="p-3 border rounded-xl">
          <div className="text-zinc-500">Sessions</div>
          <div className="font-semibold">{sessions}</div>
        </div>
        <div className="p-3 border rounded-xl">
          <div className="text-zinc-500">Present</div>
          <div className="font-semibold">{present}</div>
        </div>
        <div className="p-3 border rounded-xl">
          <div className="text-zinc-500">Absent</div>
          <div className="font-semibold">{absent}</div>
        </div>
        <div className="p-3 border rounded-xl">
          <div className="text-zinc-500">Late</div>
          <div className="font-semibold">{late}</div>
        </div>
        <div className="p-3 border rounded-xl">
          <div className="text-zinc-500">Excused</div>
          <div className="font-semibold">{excused}</div>
        </div>
        <div className="p-3 border rounded-xl">
          <div className="text-zinc-500">% Present</div>
          <div className="font-semibold">{pctPresent}%</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border rounded-xl overflow-hidden">
          <thead className="bg-zinc-50">
            <tr className="text-left text-sm text-zinc-600">
              <th className="p-3 border-b">Date</th>
              <th className="p-3 border-b">Status</th>
              <th className="p-3 border-b">Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.date} className="text-sm">
                <td className="p-3 border-b">{i.date}</td>
                <td className="p-3 border-b">
                  <span className={badge(i.status)}>{i.status}</span>
                </td>
                <td className="p-3 border-b">{i.note || '—'}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td className="p-4 text-sm text-zinc-600" colSpan={3}>
                  No data yet — choose dates and Load Week.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}

      <div className="flex gap-3">
        <a className={btnOutline} href="/headteacher/weekly">
          ← Back to Weekly Overview
        </a>
      </div>
    </div>
  )
}

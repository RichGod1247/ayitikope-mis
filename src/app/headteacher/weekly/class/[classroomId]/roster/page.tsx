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

function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10)
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

export default function WeeklyClassRosterPage() {
  const params = useParams()
  const qs = useSearchParams()
  const classroomId = String((params as any)?.classroomId ?? '')

  const [start, setStart] = useState(qs.get('start') || '')
  const [end, setEnd] = useState(qs.get('end') || '')
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const { start: s, end: e } = weekRangeMonFri(qs.get('date') ?? todayYYYYMMDD())
    if (!qs.get('start')) setStart(s)
    if (!qs.get('end')) setEnd(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId])

  async function load() {
    if (!classroomId || !start || !end) {
      setMsg('Missing inputs')
      return
    }

    setLoading(true)
    setMsg(null)

    try {
      const url =
        `/api/headteacher/weekly/class-roster` +
        `?classroomId=${encodeURIComponent(classroomId)}` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`

      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setMsg(data?.error || `Failed to load (${res.status})`)
        setRows([])
        return
      }

      setRows((data?.items || []) as Row[])
    } finally {
      setLoading(false)
    }
  }

  const defaultWeek = weekRangeMonFri(todayYYYYMMDD())

  function pctClass(p: number) {
    if (p >= 90) return 'text-emerald-700'
    if (p >= 75) return 'text-amber-700'
    return 'text-red-700'
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Weekly Class Roster (Mon–Fri)</h1>
      <p className="text-sm text-zinc-600">Per-student roll-up for this class and week.</p>

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Start (Mon)</label>
          <input
            className="w-full border rounded-xl p-2 h-10"
            value={start}
            onChange={e => setStart(e.target.value)}
            placeholder={defaultWeek.start}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">End (Fri)</label>
          <input
            className="w-full border rounded-xl p-2 h-10"
            value={end}
            onChange={e => setEnd(e.target.value)}
            placeholder={defaultWeek.end}
          />
        </div>

        <div className="flex items-end">
          <button
            className={btnPrimary + ' w-full'}
            onClick={load}
            disabled={loading || !start || !end}
          >
            {loading ? 'Loading…' : 'Load Week'}
          </button>
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
                <td className={`p-3 border-b font-semibold ${pctClass(r.pctPresent)}`}>
                  {r.pctPresent}%
                </td>
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td colSpan={10} className="p-4 text-sm text-zinc-600">
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

// src/app/headteacher/weekly/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type Row = {
  classroomId: string
  label: string
  totalStudents: number
  sessions: number
  openCount: number
  closedCount: number
  certifiedCount: number
  presentSum: number
  presentPct: number
}

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`

function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10)
}

function weekRangeMonFri(dStr?: string) {
  const base = dStr ? new Date(dStr) : new Date()
  const day = base.getUTCDay()
  const diffToMon = (day + 6) % 7
  const monday = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - diffToMon)
  const friday = new Date(monday)
  friday.setUTCDate(friday.getUTCDate() + 4)
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  return { start: toISO(monday), end: toISO(friday) }
}

export default function HeadteacherWeeklyPage() {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const { start, end } = weekRangeMonFri()
    setStart(start)
    setEnd(end)
  }, [])

  async function load() {
    if (!start || !end) return
    setLoading(true)
    setMsg(null)

    try {
      const res = await fetch(
        `/api/headteacher/weekly/overview?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: 'no-store' }
      )
      const data = await res.json()

      if (!res.ok) {
        setMsg(data?.error || 'Failed to load')
        setRows([])
        setSummary(null)
        return
      }

      setRows(data.items || [])
      setSummary(data.summary || null)
    } finally {
      setLoading(false)
    }
  }

  const exportURL = useMemo(() => {
    if (!start || !end) return ''
    return `/api/headteacher/export-csv-range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  }, [start, end])

  function pctClass(p: number) {
    if (p >= 90) return 'text-emerald-700'
    if (p >= 75) return 'text-amber-700'
    return 'text-red-700'
  }

  const defaultWeek = weekRangeMonFri(todayYYYYMMDD())

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Weekly Overview (Mon–Fri)</h1>

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Start (Mon)</label>
          <input className="w-full border rounded-xl p-2 h-10"
            value={start} onChange={e => setStart(e.target.value)}
            placeholder={defaultWeek.start} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">End (Fri)</label>
          <input className="w-full border rounded-xl p-2 h-10"
            value={end} onChange={e => setEnd(e.target.value)}
            placeholder={defaultWeek.end} />
        </div>

        <div className="flex items-end">
          <button className={`${btnPrimary} w-full`} onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Load Week'}
          </button>
        </div>

        <div className="flex items-end">
          <a className={`${btnOutline} w-full ${exportURL ? '' : 'opacity-50 pointer-events-none'}`} href={exportURL}>
            Download CSV
          </a>
        </div>
      </div>

      {summary && (
        <div className="text-sm">
          Classes: <b>{summary.classes}</b> — Sessions: <b>{summary.sessions}</b> — Certified: <b>{summary.certified}</b>
        </div>
      )}

      <table className="min-w-full border rounded-xl">
        <thead className="bg-zinc-50 text-sm">
          <tr>
            <th className="p-3">Class</th>
            <th className="p-3">Students</th>
            <th className="p-3">Sessions</th>
            <th className="p-3">% Present</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.classroomId} className="text-sm">
              <td className="p-3 font-semibold">
                <a href={`/headteacher/weekly/class/${r.classroomId}?start=${start}&end=${end}`} className="underline">
                  {r.label}
                </a>
              </td>
              <td className="p-3">{r.totalStudents}</td>
              <td className="p-3">{r.sessions}</td>
              <td className={`p-3 font-semibold ${pctClass(r.presentPct)}`}>{r.presentPct}%</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={4} className="p-4 text-center text-sm text-zinc-500">No data</td></tr>
          )}
        </tbody>
      </table>

      {msg && <div className="text-sm">{msg}</div>}
    </div>
  )
}

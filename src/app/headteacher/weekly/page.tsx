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

export default function HeadteacherWeeklyPage() {
  const [tenantId, setTenantId] = useState('')
  const [start, setStart] = useState('') // Mon
  const [end, setEnd] = useState('')     // Fri
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{classes:number;sessions:number;open:number;closed:number;certified:number;avgPresentPct:number}|null>(null)

  function todayYYYYMMDD() { const now = new Date(); return now.toISOString().slice(0, 10) }
  function weekRangeMonFri(dStr?: string) {
    const base = dStr && dStr.trim() ? new Date(dStr) : new Date()
    const day = base.getUTCDay() // 0 Sun .. 6 Sat
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
        const { start, end } = weekRangeMonFri()
        setStart(start); setEnd(end)
      })
      .catch(() => {})
  }, [])

  async function load() {
    if (!tenantId || !start || !end) { setMsg('Pick tenant and date range'); return }
    setLoading(true); setMsg(null)
    try {
      const res = await fetch(`/api/headteacher/weekly/overview?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data?.error || `Failed to load (${res.status})`); setRows([]); setSummary(null); return }
      setRows((data.items || []) as Row[])
      setSummary(data.summary || null)
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
      <h1 className="text-2xl font-bold">Weekly Overview (Mon–Fri)</h1>
      <p className="text-sm text-zinc-600">Per-class attendance performance for the school week. Click a class to drill down by day.</p>

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Start (Mon)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10"
              value={start} onChange={e => setStart(e.target.value)}
              placeholder={defaultWeek.start} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setStart(defaultWeek.start)}>This Mon</button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End (Fri)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10"
              value={end} onChange={e => setEnd(e.target.value)}
              placeholder={defaultWeek.end} />
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
            Download CSV (Mon–Fri)
          </a>
        </div>
      </div>

      {summary && (
        <div className="text-sm text-zinc-700">
          Classes: <b>{summary.classes}</b> — Sessions: <b>{summary.sessions}</b> — OPEN: <b>{summary.open}</b> — CLOSED: <b>{summary.closed}</b> — CERTIFIED: <b>{summary.certified}</b> — Avg % Present: <b>{summary.avgPresentPct}%</b>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border rounded-xl overflow-hidden">
          <thead className="bg-zinc-50">
            <tr className="text-left text-sm text-zinc-600">
              <th className="p-3 border-b">Class</th>
              <th className="p-3 border-b">Students</th>
              <th className="p-3 border-b">Sessions</th>
              <th className="p-3 border-b">Open</th>
              <th className="p-3 border-b">Closed</th>
              <th className="p-3 border-b">Certified</th>
              <th className="p-3 border-b">Present (sum)</th>
              <th className="p-3 border-b">% Present</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.classroomId} className="text-sm">
                <td className="p-3 border-b font-semibold">
                  <a
                    className="underline decoration-dotted hover:decoration-solid"
                    href={`/headteacher/weekly/class/${encodeURIComponent(r.classroomId)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}
                    title="View daily details"
                  >
                    {r.label}
                  </a>
                </td>
                <td className="p-3 border-b">{r.totalStudents}</td>
                <td className="p-3 border-b">{r.sessions}</td>
                <td className="p-3 border-b">{r.openCount}</td>
                <td className="p-3 border-b">{r.closedCount}</td>
                <td className="p-3 border-b">{r.certifiedCount}</td>
                <td className="p-3 border-b">{r.presentSum}</td>
                <td className={`p-3 border-b font-semibold ${pctClass(r.presentPct)}`}>{r.presentPct}%</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td className="p-4 text-sm text-zinc-600" colSpan={8}>No data yet — choose dates and Load Week.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}
    </div>
  )
}

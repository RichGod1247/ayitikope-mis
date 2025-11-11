// src/app/headteacher/weekly/class/[classroomId]/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

type Row = { date: string; total: number; present: number; pctPresent: number; state: 'OPEN' | 'CLOSED' | 'CERTIFIED' }

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`

export default function WeeklyClassDetailPage() {
  const params = useParams<{ classroomId: string }>()
  const qs = useSearchParams()

  const [tenantId, setTenantId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [classLabel, setClassLabel] = useState('')
  const classroomId = params.classroomId

  function todayYYYYMMDD() { const now = new Date(); return now.toISOString().slice(0, 10) }
  function weekRangeMonFri(dStr?: string) {
    const base = dStr && dStr.trim() ? new Date(dStr) : new Date()
    const day = base.getUTCDay() // Sun=0..Sat=6
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
        setStart(qs.get('start') ?? start)
        setEnd(qs.get('end') ?? end)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId])

  async function load() {
    if (!tenantId || !classroomId || !start || !end) { setMsg('Missing inputs'); return }
    setLoading(true); setMsg(null)
    try {
      const url = `/api/headteacher/weekly/class-detail?tenantId=${encodeURIComponent(tenantId)}&classroomId=${encodeURIComponent(classroomId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      const res = await fetch(url)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data?.error || `Failed to load (${res.status})`); setRows([]); return }
      setClassLabel(data?.meta?.classLabel || '')
      setRows((data?.items || []) as Row[])
    } finally {
      setLoading(false)
    }
  }

  const exportURL = useMemo(() => {
    if (!tenantId || !start || !end) return ''
    return `/api/headteacher/export-csv-range?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  }, [tenantId, start, end])

  function stateBadge(s: Row['state']) {
    const base = 'text-xs px-2 py-1 rounded-full border'
    if (s === 'CERTIFIED') return `${base} bg-indigo-50 border-indigo-200 text-indigo-900`
    if (s === 'CLOSED') return `${base} bg-red-50 border-red-200 text-red-900`
    return `${base} bg-yellow-50 border-yellow-200`
  }

  function pctClass(p: number) {
    if (p >= 90) return 'text-emerald-700'
    if (p >= 75) return 'text-amber-700'
    return 'text-red-700'
  }

  const defaultWeek = weekRangeMonFri(todayYYYYMMDD())

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Weekly Class Detail (Mon–Fri)</h1>
      <p className="text-sm text-zinc-600">Per-day attendance for: <b>{classLabel || 'Loading…'}</b></p>

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
        <div className="flex items-end gap-2">
          <a className={`${btnOutline} w-full ${exportURL ? '' : 'pointer-events-none opacity-50'}`} href={exportURL}>
            Download CSV (Mon–Fri)
          </a>
          <a
            className={btnOutline + ' w-full'}
            href={`/headteacher/weekly/class/${encodeURIComponent(classroomId)}/roster?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}
          >
            View Roster (Mon–Fri)
          </a>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border rounded-xl overflow-hidden">
          <thead className="bg-zinc-50">
            <tr className="text-left text-sm text-zinc-600">
              <th className="p-3 border-b">Date</th>
              <th className="p-3 border-b">Present</th>
              <th className="p-3 border-b">Total</th>
              <th className="p-3 border-b">% Present</th>
              <th className="p-3 border-b">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.date} className="text-sm">
                <td className="p-3 border-b">{r.date}</td>
                <td className="p-3 border-b">{r.present}</td>
                <td className="p-3 border-b">{r.total}</td>
                <td className={`p-3 border-b font-semibold ${pctClass(r.pctPresent)}`}>{r.pctPresent}%</td>
                <td className="p-3 border-b"><span className={stateBadge(r.state)}>{r.state}</span></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td className="p-4 text-sm text-zinc-600" colSpan={5}>No data yet — choose dates and Load Week.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}

      <div className="flex gap-3">
        <a className={btnOutline} href="/headteacher/weekly">← Back to Weekly Overview</a>
      </div>
    </div>
  )
}

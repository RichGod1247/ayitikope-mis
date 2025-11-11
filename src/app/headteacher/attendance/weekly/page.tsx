// src/app/headteacher/attendance/weekly/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Tenant = { id: string; name: string; slug: string }

function startOfWeekMonday(d: Date): Date {
  const day = d.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  x.setUTCDate(x.getUTCDate() + diff)
  return x
}
function fmt(n: number) { return n.toLocaleString() }

type KPI = {
  classLabel: string
  enrolled: number
  marks: number
  present: number
  absent: number
  late: number
  excused: number
  pct: number
}

export default function WeeklyAttendancePage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState<string>('')

  const [start, setStart] = useState<string>('')
  const [end, setEnd] = useState<string>('')

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<KPI[]>([])
  const [error, setError] = useState<string>('')

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const today = new Date()
    const mon = startOfWeekMonday(today)
    const fri = new Date(mon)
    fri.setUTCDate(mon.getUTCDate() + 4)
    setStart(mon.toISOString().slice(0, 10))
    setEnd(fri.toISOString().slice(0, 10))

    fetch('/api/test/tenants').then(r => r.json()).then(j => {
      const arr = Array.isArray(j?.tenants) ? (j.tenants as Tenant[]) : []
      setTenants(arr)
      if (arr.length && !tenantId) setTenantId(arr[0].id)
    })
  }, [])

  const canQuery = useMemo(() => tenantId && start && end, [tenantId, start, end])

  async function loadNow() {
    if (!canQuery) return
    setLoading(true)
    setError('')
    setRows([])

    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const u = new URL('/api/headteacher/attendance/weekly/csv', window.location.origin)
      u.searchParams.set('tenantId', tenantId)
      u.searchParams.set('start', start)
      u.searchParams.set('end', end)
      const res = await fetch(u.toString(), { cache: 'no-store', signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const csv = await res.text()
      const lines = csv.trim().split('\n')
      const body = lines.slice(1) // skip header
      const parsed: KPI[] = body
        .filter(Boolean)
        .map(line => {
          const [label, enrolled, marks, present, absent, late, excused, pct] = line.split(',')
          return {
            classLabel: label,
            enrolled: Number(enrolled || 0),
            marks: Number(marks || 0),
            present: Number(present || 0),
            absent: Number(absent || 0),
            late: Number(late || 0),
            excused: Number(excused || 0),
            pct: Number(pct || 0),
          }
        })
      setRows(parsed)
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Failed to load weekly report')
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canQuery) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { loadNow() }, 400)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, start, end])

  function downloadCSV() {
    if (!canQuery) return
    const u = new URL('/api/headteacher/attendance/weekly/csv', window.location.origin)
    u.searchParams.set('tenantId', tenantId)
    u.searchParams.set('start', start)
    u.searchParams.set('end', end)
    window.location.href = u.toString()
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.enrolled += r.enrolled
      acc.marks += r.marks
      acc.present += r.present
      acc.absent += r.absent
      acc.late += r.late
      acc.excused += r.excused
      return acc
    },
    { enrolled: 0, marks: 0, present: 0, absent: 0, late: 0, excused: 0 }
  )
  const pctOverall = totals.marks > 0 ? Math.round((totals.present / totals.marks) * 1000) / 10 : 0

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Weekly Attendance Report</h1>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-500">School (Tenant)</label>
          <select
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
          >
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Start (Mon)</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="text-xs text-gray-500">End (Fri)</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border rounded-lg px-3 py-2" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadNow}
            className="rounded-lg px-4 py-2 bg-blue-600 text-white shadow hover:bg-blue-700"
            disabled={loading || !canQuery}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={() => {
              const today = new Date()
              const mon = startOfWeekMonday(today)
              const fri = new Date(mon)
              fri.setUTCDate(mon.getUTCDate() + 4)
              setStart(mon.toISOString().slice(0, 10))
              setEnd(fri.toISOString().slice(0, 10))
            }}
            className="rounded-lg px-4 py-2 border"
            disabled={loading}
          >
            This Week (Mon–Fri)
          </button>
          <button
            onClick={downloadCSV}
            className="rounded-lg px-4 py-2 border hover:bg-gray-50"
            disabled={!canQuery}
            title="Download CSV"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Classes</div>
          <div className="text-2xl font-semibold">{fmt(rows.length)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Total Marks Taken</div>
          <div className="text-2xl font-semibold">{fmt(totals.marks)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Total Present</div>
          <div className="text-2xl font-semibold">{fmt(totals.present)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Overall Present %</div>
          <div className="text-2xl font-semibold">{pctOverall.toFixed(1)}%</div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto">
        <div className="p-3 font-medium">By Class (Mon–Fri)</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-t border-b">
            <tr>
              <th className="text-left p-2">Class</th>
              <th className="text-right p-2">Enrolled</th>
              <th className="text-right p-2">Marks</th>
              <th className="text-right p-2">Present</th>
              <th className="text-right p-2">Absent</th>
              <th className="text-right p-2">Late</th>
              <th className="text-right p-2">Excused</th>
              <th className="text-right p-2">Present %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.classLabel}-${idx}`} className="border-b">
                <td className="p-2">{r.classLabel}</td>
                <td className="p-2 text-right">{fmt(r.enrolled)}</td>
                <td className="p-2 text-right">{fmt(r.marks)}</td>
                <td className="p-2 text-right">{fmt(r.present)}</td>
                <td className="p-2 text-right">{fmt(r.absent)}</td>
                <td className="p-2 text-right">{fmt(r.late)}</td>
                <td className="p-2 text-right">{fmt(r.excused)}</td>
                <td className="p-2 text-right">{r.pct.toFixed(1)}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-4 text-gray-500" colSpan={8}>No data in this range.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="text-xs text-gray-500">
        Tip: Share the CSV with municipal officers or print as a weekly record.
      </div>
    </div>
  )
}

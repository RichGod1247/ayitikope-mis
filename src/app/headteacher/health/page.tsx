// src/app/headteacher/health/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Tenant = { id: string; name: string; slug: string }
type Summary = {
  tenantId: string
  start: string
  end: string
  fever: number
  totals: { entries: number; fevers: number; symptomatic: number }
  byClass: Array<{ classroomId: string; classLabel: string; entries: number; fevers: number; symptomatic: number }>
  symptoms: Array<{ name: string; count: number }>
  days: Array<{ date: string; entries: number; fevers: number }>
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getUTCDay() // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  x.setUTCDate(x.getUTCDate() + diff)
  return x
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmt(n: number) { return n.toLocaleString() }

export default function HeadteacherHealthPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState<string>('')
  const [start, setStart] = useState<string>('')
  const [end, setEnd] = useState<string>('')

  const [fever, setFever] = useState<number>(37.8)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string>('')

  // Abort controller ref to cancel in-flight fetches
  const abortRef = useRef<AbortController | null>(null)
  // Debounce timer
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize Monday → Friday of current week (UTC) and default tenant
  useEffect(() => {
    const today = new Date()
    const mon = startOfWeekMonday(today)
    const fri = new Date(mon)
    fri.setUTCDate(mon.getUTCDate() + 4)
    const s = mon.toISOString().slice(0, 10)
    const e = fri.toISOString().slice(0, 10)
    setStart(s)
    setEnd(e)

    fetch('/api/test/tenants')
      .then(r => r.json())
      .then(j => {
        const arr = Array.isArray(j?.tenants) ? (j.tenants as Tenant[]) : []
        setTenants(arr)
        if (arr.length && !tenantId) setTenantId(arr[0].id)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canQuery = useMemo(() => tenantId && start && end, [tenantId, start, end])

  async function loadNow() {
    if (!canQuery) return
    setLoading(true)
    setError('')
    setData(null)

    // Cancel previous request if any
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const u = new URL('/api/headteacher/health/summary', window.location.origin)
      u.searchParams.set('tenantId', tenantId)
      u.searchParams.set('start', start)
      u.searchParams.set('end', end)
      u.searchParams.set('fever', String(fever))
      const res = await fetch(u.toString(), { cache: 'no-store', signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as Summary
      setData(json)
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // silently ignore aborted requests
      } else {
        setError('Failed to load health summary')
      }
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null
      }
      setLoading(false)
    }
  }

  // Debounce 500ms on parameter changes to avoid spamming server
  useEffect(() => {
    if (!canQuery) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      loadNow()
    }, 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, start, end, fever])

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Student Health — Weekly Summary</h1>

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
        <div>
          <label className="text-xs text-gray-500">Fever Threshold (°C)</label>
          <input
            type="number" step="0.1" min="35" max="42"
            value={fever}
            onChange={e => setFever(Number(e.target.value || 37.8))}
            className="w-[140px] border rounded-lg px-3 py-2"
          />
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
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Total Health Entries</div>
          <div className="text-2xl font-semibold">{fmt(data?.totals.entries ?? 0)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Fevers ≥ {fever.toFixed(1)}°C</div>
          <div className="text-2xl font-semibold">{fmt(data?.totals.fevers ?? 0)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">With Symptoms</div>
          <div className="text-2xl font-semibold">{fmt(data?.totals.symptomatic ?? 0)}</div>
        </div>
      </div>

      {/* By Class */}
      <div className="rounded-xl border overflow-x-auto">
        <div className="p-3 font-medium">By Class</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-t border-b">
            <tr>
              <th className="text-left p-2">Class</th>
              <th className="text-right p-2">Entries</th>
              <th className="text-right p-2">Fevers</th>
              <th className="text-right p-2">With Symptoms</th>
            </tr>
          </thead>
          <tbody>
            {(data?.byClass ?? []).map((r) => (
              <tr key={r.classroomId} className="border-b">
                <td className="p-2">{r.classLabel}</td>
                <td className="p-2 text-right">{fmt(r.entries)}</td>
                <td className="p-2 text-right">
                  <span className={r.fevers > 0 ? 'text-red-600 font-semibold' : ''}>{fmt(r.fevers)}</span>
                </td>
                <td className="p-2 text-right">{fmt(r.symptomatic)}</td>
              </tr>
            ))}
            {(!data || (data.byClass?.length ?? 0) === 0) && (
              <tr><td className="p-4 text-gray-500" colSpan={4}>No data in this range.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Top Symptoms */}
      <div className="rounded-xl border">
        <div className="p-3 font-medium">Top Symptoms (Mon–Fri)</div>
        <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {(data?.symptoms ?? []).slice(0, 12).map(s => (
            <div key={s.name} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">{s.name}</span>
              <span className="text-sm font-semibold">{fmt(s.count)}</span>
            </div>
          ))}
          {(!data || (data.symptoms?.length ?? 0) === 0) && (
            <div className="text-sm text-gray-500 p-2">No symptom records.</div>
          )}
        </div>
      </div>

      {/* Day Trend */}
      <div className="rounded-xl border overflow-x-auto">
        <div className="p-3 font-medium">Daily Trend</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-t border-b">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-right p-2">Entries</th>
              <th className="text-right p-2">Fevers</th>
            </tr>
          </thead>
          <tbody>
            {(data?.days ?? []).map(d => (
              <tr key={d.date} className="border-b">
                <td className="p-2">{d.date}</td>
                <td className="p-2 text-right">{fmt(d.entries)}</td>
                <td className="p-2 text-right">
                  <span className={d.fevers > 0 ? 'text-red-600 font-semibold' : ''}>{fmt(d.fevers)}</span>
                </td>
              </tr>
            ))}
            {(!data || (data.days?.length ?? 0) === 0) && (
              <tr><td className="p-4 text-gray-500" colSpan={3}>No data in this range.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="text-xs text-gray-500">
        Tip: Use “This Week (Mon–Fri)” and adjust fever threshold to 37.5–38.0°C if needed.
      </div>
    </div>
  )
}

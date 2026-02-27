// src/app/headteacher/alerts/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type Anomaly = {
  date: string
  classroomId: string
  classLabel: string
  total: number
  present: number
  pctPresent: number
  state: 'OPEN' | 'CLOSED' | 'CERTIFIED'
}

type Me = { ok: boolean; tenantId: string | null }

export default function HeadteacherAlertsPage() {
  const [tenantId, setTenantId] = useState<string>('')
  const [start, setStart] = useState<string>('') // YYYY-MM-DD (Mon)
  const [end, setEnd] = useState<string>('')     // YYYY-MM-DD (Fri)
  const [threshold, setThreshold] = useState<number>(80)
  const [items, setItems] = useState<Anomaly[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    let alive = true
    ;(async () => {
      try {
        const meRes = await fetch('/api/me', { cache: 'no-store' })
        const me = (await meRes.json().catch(() => ({}))) as Me
        const tid = me?.tenantId ? String(me.tenantId) : ''
        const { start, end } = weekRangeMonFri()
        if (!alive) return
        setTenantId(tid)
        setStart(start); setEnd(end)
        if (!tid) setMsg('No active tenant in session. Log in again or select a school.')
      } catch {
        if (alive) setMsg('Failed to load session (tenant).')
      }
    })()
    return () => { alive = false }
  }, [])

  async function load() {
    if (!tenantId || !start || !end) { setMsg('Pick date range'); return }
    setLoading(true); setMsg(null)

    const url =
      `/api/headteacher/anomalies?tenantId=${encodeURIComponent(tenantId)}` +
      `&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` +
      `&threshold=${encodeURIComponent(String(threshold))}`

    try {
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data?.error || `Failed to load (${res.status})`); setItems([]); return }
      setItems((data.items || []) as Anomaly[])
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    if (!items.length) return { count: 0, worst: null as null | Anomaly }
    let worst = items[0]
    for (const it of items) if (it.pctPresent < worst.pctPresent) worst = it
    return { count: items.length, worst }
  }, [items])

  function badge(state: Anomaly['state']) {
    const base = 'text-xs px-2 py-1 rounded-full border'
    if (state === 'CERTIFIED') return `${base} bg-indigo-50 border-indigo-200 text-indigo-900`
    if (state === 'CLOSED') return `${base} bg-red-50 border-red-200 text-red-900`
    return `${base} bg-yellow-50 border-yellow-200`
  }

  const weekDefault = weekRangeMonFri(todayYYYYMMDD())

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Attendance Alerts (Mon–Fri)</h1>
      <p className="text-sm text-zinc-600">
        Flags any class/day where attendance % falls below a threshold (default 80%) for the school week <b>Monday → Friday</b>.
      </p>

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Start (YYYY-MM-DD)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10" value={start} onChange={e => setStart(e.target.value)} placeholder={weekDefault.start} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setStart(weekDefault.start)}>This Mon</button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">End (YYYY-MM-DD)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10" value={end} onChange={e => setEnd(e.target.value)} placeholder={weekDefault.end} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setEnd(weekDefault.end)}>This Fri</button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Threshold %</label>
          <input type="number" min={0} max={100} className="w-full border rounded-xl p-2 h-10" value={threshold} onChange={e => setThreshold(Number(e.target.value))} />
          <div className="text-xs text-zinc-600 mt-1">Alert when Present% &lt; threshold</div>
        </div>

        <div className="flex items-end">
          <button
            className="inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm bg-black text-white hover:bg-zinc-800 w-full disabled:opacity-50"
            onClick={load}
            disabled={!tenantId || !start || !end || loading}
          >
            {loading ? 'Scanning…' : 'Scan Range (Mon–Fri)'}
          </button>
        </div>
      </div>

      <div className="text-sm text-zinc-700">
        {summary.count ? (
          <>Found <b>{summary.count}</b> anomaly{summary.count > 1 ? 'ies' : ''}. {summary.worst ? <>Worst: <b>{summary.worst.classLabel}</b> on <b>{summary.worst.date}</b> — <b>{summary.worst.pctPresent}%</b> present.</> : null}</>
        ) : 'No anomalies yet.'}
      </div>

      <div className="grid gap-2">
        {items.map((it, idx) => (
          <div key={`${it.date}-${it.classroomId}-${idx}`} className="flex items-center justify-between border rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="font-semibold">{it.classLabel}</div>
              <div className="text-sm text-zinc-700">{it.date}</div>
              <span className={badge(it.state)}>{it.state}</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold">{it.pctPresent}%</span> present{' '}
              <span className="text-zinc-600">({it.present}/{it.total})</span>
            </div>
          </div>
        ))}
        {!items.length && <div className="text-sm text-zinc-600">No low-attendance flags in this range.</div>}
      </div>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}
    </div>
  )
}

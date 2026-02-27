// src/app/headteacher/health/teachers/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchActiveTenant } from '@/lib/client/activeTenant'

type WeeklyRow = {
  userId: string
  name: string | null
  email: string | null
  submitted: boolean
  stressLevel?: number | null
  workload?: number | null
  comments?: string | null
}

function mondayISO(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = dt.getUTCDay() || 7 // 1..7, with Sunday as 7
  if (day > 1) dt.setUTCDate(dt.getUTCDate() - (day - 1))
  return dt.toISOString().slice(0, 10)
}

const btn =
  'inline-flex items-center justify-center h-9 px-3 rounded-lg border text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed'
const primary = `${btn} bg-black text-white border-black hover:bg-zinc-800`
const outline = `${btn} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`

export default function HeadteacherTeachersWeekly() {
  const [tenantId, setTenantId] = useState('')
  const [weekStart, setWeekStart] = useState(() => mondayISO(new Date()))

  const [rows, setRows] = useState<WeeklyRow[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const t = await fetchActiveTenant()
      if (t?.id) setTenantId(t.id)
    })()
  }, [])

  const weekLabel = useMemo(() => {
    const d = new Date(`${weekStart}T00:00:00.000Z`)
    const fri = new Date(d)
    fri.setUTCDate(fri.getUTCDate() + 4)
    const fmt = (x: Date) => x.toISOString().slice(0, 10)
    return `${fmt(d)} → ${fmt(fri)}`
  }, [weekStart])

  async function loadList() {
    if (!tenantId || !weekStart) return
    setLoading(true)
    setMsg(null)
    try {
      const url = `/api/headteacher/health/teachers/weekly/list?tenantId=${encodeURIComponent(
        tenantId
      )}&start=${encodeURIComponent(weekStart)}&end=${encodeURIComponent(weekStart)}`
      const r = await fetch(url, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to load weekly list')
        setRows([])
        return
      }
      setRows(Array.isArray(j?.items) ? j.items : [])
    } finally {
      setLoading(false)
    }
  }

  async function loadMissing() {
    if (!tenantId || !weekStart) return
    try {
      const url = `/api/headteacher/health/teachers/weekly/missing?weekStart=${encodeURIComponent(
        weekStart
      )}`
      const r = await fetch(url, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (r.ok && Array.isArray(j?.items)) {
        setMissing(j.items.map((x: any) => String(x.userId || '')).filter(Boolean))
      } else {
        setMissing([])
      }
    } catch {
      setMissing([])
    }
  }

  useEffect(() => {
    if (tenantId && weekStart) {
      loadList()
      loadMissing()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, weekStart])

  async function remindMissing() {
    if (!tenantId || !weekStart) return
    setLoading(true)
    setMsg(null)
    try {
      const r = await fetch('/api/headteacher/health/teachers/weekly/remind', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, weekStart }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Remind failed')
        return
      }
      const count = typeof j?.reminded === 'number' ? j.reminded : 0
      setMsg(`Reminders queued: ${count}`)
      await loadMissing()
    } finally {
      setLoading(false)
    }
  }

  function shiftWeek(delta: number) {
    const d = new Date(`${weekStart}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + delta * 7)
    setWeekStart(mondayISO(d))
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Teachers — Weekly Health</h1>
      <p className="text-sm text-zinc-600">
        Track who submitted weekly health check-ins. Send reminders (stubbed SMS) to those missing.
      </p>

      <div className="border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <button className={outline} onClick={() => shiftWeek(-1)} disabled={loading}>
            ← Prev
          </button>
          <div className="text-sm font-semibold px-3 py-2 border rounded-lg bg-zinc-50">
            {weekLabel}
          </div>
          <button className={outline} onClick={() => shiftWeek(1)} disabled={loading}>
            Next →
          </button>
          <div className="grow" />
          <button
            className={primary}
            onClick={remindMissing}
            disabled={loading || !tenantId || !weekStart || !missing.length}
            title={!missing.length ? 'No missing entries to remind' : 'Send reminder to missing teachers'}
          >
            Remind Missing
          </button>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-zinc-50">
            <tr className="text-left text-sm text-zinc-600">
              <th className="p-3 border-b">Teacher</th>
              <th className="p-3 border-b">Email</th>
              <th className="p-3 border-b">Submitted?</th>
              <th className="p-3 border-b">Stress</th>
              <th className="p-3 border-b">Workload</th>
              <th className="p-3 border-b">Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const key = `${r.userId ?? r.email ?? 'row'}-${idx}`
              const isMissing = missing.includes(r.userId)
              return (
                <tr key={key} className="text-sm align-top">
                  <td className="p-3 border-b font-semibold">{r.name || '(No name)'}</td>
                  <td className="p-3 border-b">{r.email || ''}</td>
                  <td className="p-3 border-b">
                    {r.submitted ? (
                      <span className="inline-block text-xs px-2 py-1 rounded-full bg-green-50 text-green-800 border border-green-200">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-block text-xs px-2 py-1 rounded-full bg-red-50 text-red-800 border border-red-200">
                        No {isMissing ? '(missing)' : ''}
                      </span>
                    )}
                  </td>
                  <td className="p-3 border-b">{r.stressLevel ?? ''}</td>
                  <td className="p-3 border-b">{r.workload ?? ''}</td>
                  <td className="p-3 border-b max-w-[360px] break-words">{r.comments ?? ''}</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr>
                <td className="p-4 text-sm text-zinc-600" colSpan={6}>
                  No data for this week.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}
    </div>
  )
}

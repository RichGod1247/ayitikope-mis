// src/app/headteacher/day/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchActiveTenant } from '@/lib/client/activeTenant'

type Item = {
  classroomId: string
  label: string
  sessionId: string | null
  status: 'NO_SESSION' | 'OPEN' | 'CLOSED' | 'CERTIFIED'
  closedAt: string | null
  certifiedAt: string | null
}

type Summary = {
  total: number
  NO_SESSION: number
  OPEN: number
  CLOSED: number
  CERTIFIED: number
}

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`
const btnGhost = `${btnBase} bg-transparent text-zinc-900 border-transparent hover:bg-zinc-100`

export default function HeadteacherDayPage() {
  const [tenantId, setTenantId] = useState<string>('')
  const [date, setDate] = useState<string>('')

  const [items, setItems] = useState<Item[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [loadingPage, setLoadingPage] = useState(false)
  const [loadingBulk, setLoadingBulk] = useState(false)
  const [loadingRow, setLoadingRow] = useState<string | null>(null)

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
    })()
  }, [])

  useEffect(() => {
    if (tenantId) refresh({ clearMsg: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  async function refresh(opts?: { clearMsg?: boolean }) {
    if (!tenantId) return
    const clearMsg = opts?.clearMsg ?? false
    if (clearMsg) setMsg(null)

    setLoadingPage(true)
    const d = (date || '').trim() || todayYYYYMMDD()
    try {
      const res = await fetch(
        `/api/headteacher/day/overview?tenantId=${encodeURIComponent(tenantId)}&date=${encodeURIComponent(d)}`,
        { cache: 'no-store' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setItems([])
        setSummary(null)
        setMsg(data?.error || `Failed to load (${res.status})`)
        return
      }

      setItems(
        (data.items || []).map((x: any) => ({
          ...x,
          closedAt: x.closedAt ? String(x.closedAt) : null,
          certifiedAt: x.certifiedAt ? String(x.certifiedAt) : null,
        }))
      )
      setSummary(data.summary || null)
    } finally {
      setLoadingPage(false)
    }
  }

  async function certifyOne(sessionId: string) {
    setMsg('Certifying…')
    setLoadingRow(sessionId)
    try {
      const res = await fetch('/api/attendance/sessions/certify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(`Certify failed: ${data?.error || res.status}`)
        return
      }
      setMsg('Certified.')
      await refresh({ clearMsg: false })
    } catch {
      setMsg('Certify failed: Network error')
    } finally {
      setLoadingRow(null)
    }
  }

  async function reopenOne(sessionId: string) {
    setMsg('Reopening…')
    setLoadingRow(sessionId)
    try {
      const res = await fetch('/api/attendance/sessions/reopen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(`Reopen failed: ${data?.error || res.status}`)
        return
      }
      setMsg('Session reopened (now OPEN).')
      await refresh({ clearMsg: false })
    } catch {
      setMsg('Reopen failed: Network error')
    } finally {
      setLoadingRow(null)
    }
  }

  async function bulkCertify() {
    if (!tenantId) return
    const d = (date || '').trim() || todayYYYYMMDD()
    setMsg('Bulk certifying…')
    setLoadingBulk(true)
    try {
      const res = await fetch('/api/headteacher/day/bulk-certify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, date: d }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(`Bulk certify failed: ${data?.error || res.status}`)
        return
      }
      setMsg(`Bulk certified ${Number(data.updatedCount || 0)} sessions.`)
      await refresh({ clearMsg: false })
    } catch {
      setMsg('Bulk certify failed: Network error')
    } finally {
      setLoadingBulk(false)
    }
  }

  const countsText = useMemo(() => {
    if (!summary) return ''
    return `Total: ${summary.total} — OPEN: ${summary.OPEN}, CLOSED: ${summary.CLOSED}, CERTIFIED: ${summary.CERTIFIED}, NO SESSION: ${summary.NO_SESSION}`
  }, [summary])

  function badge(status: Item['status']) {
    const base = 'text-xs px-2 py-1 rounded-full border'
    if (status === 'CERTIFIED') return `${base} bg-indigo-50 border-indigo-200 text-indigo-900`
    if (status === 'CLOSED') return `${base} bg-red-50 border-red-200 text-red-900`
    if (status === 'OPEN') return `${base} bg-emerald-50 border-emerald-200 text-emerald-900`
    return `${base} bg-gray-50 border-gray-200 text-gray-900`
  }

  const { start, end } = weekRangeMonFri(date || todayYYYYMMDD())
  const weeklyCsvURL = tenantId
    ? `/api/headteacher/export-csv-range?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(
        start
      )}&end=${encodeURIComponent(end)}`
    : ''

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Headteacher Day View</h1>
      <p className="text-sm text-zinc-600">
        Pick a date, see each class status, certify individually or in bulk, export (Mon–Fri), or reopen to correct mistakes.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-60">
          <label className="block text-sm font-medium mb-1">Date (YYYY-MM-DD)</label>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-xl p-2 h-10"
              placeholder={todayYYYYMMDD()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button className={btnOutline + ' shrink-0'} onClick={() => setDate(todayYYYYMMDD())}>
              Today
            </button>
            <button className={btnGhost + ' shrink-0'} onClick={() => setDate('')}>
              Clear
            </button>
          </div>
          <div className="text-xs text-zinc-600 mt-1">
            Week (Mon–Fri): {start} → {end}
          </div>
        </div>

        <div className="basis-full h-0" />

        <div className="flex flex-wrap gap-3">
          <button className={btnPrimary} onClick={() => refresh({ clearMsg: true })} disabled={!tenantId || loadingPage}>
            {loadingPage ? 'Loading…' : 'Refresh'}
          </button>

          <button
            className={btnOutline}
            onClick={bulkCertify}
            disabled={!tenantId || loadingBulk}
            title="Certify all CLOSED sessions for the selected date"
          >
            {loadingBulk ? 'Bulk certifying…' : 'Bulk Certify (all CLOSED)'}
          </button>

          <a className={`${btnOutline} ${weeklyCsvURL ? '' : 'pointer-events-none opacity-50'}`} href={weeklyCsvURL}>
            Download Week (Mon–Fri) CSV
          </a>

          <a className={btnOutline} href="/headteacher/alerts">
            Alerts
          </a>

          <a className={btnOutline} href="/headteacher/weekly">
            Weekly Overview
          </a>
        </div>
      </div>

      {summary && <div className="text-sm text-zinc-700">{countsText}</div>}

      <div className="grid gap-2">
        {items.map((it) => (
          <div key={it.classroomId} className="flex items-center justify-between border rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="font-semibold">{it.label || 'Class'}</div>
              <span className={badge(it.status)}>{it.status}</span>
              {it.certifiedAt && <span className="text-xs text-zinc-600">at {new Date(it.certifiedAt).toLocaleString()}</span>}
            </div>

            <div className="flex items-center gap-2">
              <a
                className={`${btnOutline} h-8 px-3 text-xs ${it.sessionId ? '' : 'pointer-events-none opacity-50'}`}
                href={
                  it.sessionId
                    ? `/api/attendance/sessions/export-csv?tenantId=${encodeURIComponent(
                        tenantId
                      )}&classroomId=${encodeURIComponent(it.classroomId)}&date=${encodeURIComponent(
                        (date || '').trim() || todayYYYYMMDD()
                      )}`
                    : '#'
                }
              >
                CSV
              </a>

              <button
                className={`${btnOutline} h-8 px-3 text-xs`}
                onClick={() => (it.sessionId ? certifyOne(it.sessionId) : null)}
                disabled={!it.sessionId || it.status === 'CERTIFIED' || loadingRow === it.sessionId}
              >
                {loadingRow === it.sessionId ? 'Working…' : 'Certify'}
              </button>

              <button
                className={`${btnOutline} h-8 px-3 text-xs`}
                onClick={() => (it.sessionId ? reopenOne(it.sessionId) : null)}
                disabled={!it.sessionId || (it.status !== 'CERTIFIED' && it.status !== 'CLOSED') || loadingRow === it.sessionId}
              >
                {loadingRow === it.sessionId ? 'Working…' : 'Reopen'}
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="text-sm text-zinc-600">No classrooms found.</div>}
      </div>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}
    </div>
  )
}

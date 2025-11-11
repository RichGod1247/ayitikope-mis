// src/app/headteacher/adviser/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type ClassSug = {
  classroomId: string
  label: string
  sessions: number
  students: number
  presentSum: number
  avgPctPresent: number
  open: number
  closed: number
  certified: number
  issues: string[]
  suggestion: string
}

type StudentSug = {
  studentId: string
  fullName: string
  classroomId: string
  classLabel: string
  sessions: number
  present: number
  absent: number
  late: number
  excused: number
  noMark: number
  pctPresent: number
  issues: string[]
  suggestion: string
}

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`

export default function HeadteacherAdviserPage() {
  const [tenantId, setTenantId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [classSugs, setClassSugs] = useState<ClassSug[]>([])
  const [studentSugs, setStudentSugs] = useState<StudentSug[]>([])

  function todayYYYYMMDD() { const now = new Date(); return now.toISOString().slice(0, 10) }
  function weekRangeMonFri(dStr?: string) {
    const base = dStr && dStr.trim() ? new Date(dStr) : new Date()
    const day = base.getUTCDay()
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
      const url = `/api/headteacher/adviser/suggestions?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      const res = await fetch(url)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data?.error || `Failed to load (${res.status})`); setClassSugs([]); setStudentSugs([]); return }
      setClassSugs((data.classSuggestions || []) as ClassSug[])
      setStudentSugs((data.studentSuggestions || []) as StudentSug[])
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
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Headteacher Adviser (Mon–Fri)</h1>
      <p className="text-sm text-zinc-600">Transparent rules generate actionable recommendations. Click through to fix at source.</p>

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Start (Mon)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10" value={start} onChange={e => setStart(e.target.value)} placeholder={defaultWeek.start} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setStart(defaultWeek.start)}>This Mon</button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End (Fri)</label>
          <div className="flex gap-2">
            <input className="w-full border rounded-xl p-2 h-10" value={end} onChange={e => setEnd(e.target.value)} placeholder={defaultWeek.end} />
            <button className="h-10 px-3 rounded-xl border shadow-sm hover:bg-zinc-50" onClick={() => setEnd(defaultWeek.end)}>This Fri</button>
          </div>
        </div>
        <div className="flex items-end">
          <button className={btnPrimary + ' w-full'} onClick={load} disabled={loading || !tenantId || !start || !end}>
            {loading ? 'Loading…' : 'Load Suggestions'}
          </button>
        </div>
        <div className="flex items-end">
          <a className={`${btnOutline} w-full ${exportURL ? '' : 'pointer-events-none opacity-50'}`} href={exportURL}>
            Download School CSV (Mon–Fri)
          </a>
        </div>
      </div>

      {/* Class-level suggestions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Class Actions</h2>
          <a className={btnOutline} href="/headteacher/weekly">Go to Weekly Overview</a>
        </div>

        <div className="grid gap-3">
          {classSugs.map(c => (
            <div key={c.classroomId} className="border rounded-xl p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-base font-semibold">{c.label}</div>
                  <div className="text-sm text-zinc-700">
                    Sessions: <b>{c.sessions}</b> • Students: <b>{c.students}</b> • Avg % Present: <b className={pctClass(c.avgPctPresent)}>{c.avgPctPresent}%</b> •
                    {' '}Open: <b>{c.open}</b> • Closed: <b>{c.closed}</b> • Certified: <b>{c.certified}</b>
                  </div>
                  {c.issues.length ? (
                    <div className="text-sm text-red-700">Issues: {c.issues.join(' — ')}</div>
                  ) : (
                    <div className="text-sm text-emerald-700">No issues detected.</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <a className={btnOutline}
                     href={`/headteacher/weekly/class/${encodeURIComponent(c.classroomId)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}>
                    View Class Days
                  </a>
                  <a className={btnOutline}
                     href={`/headteacher/weekly/class/${encodeURIComponent(c.classroomId)}/roster?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}>
                    View Roster
                  </a>
                </div>
              </div>
              <div className="mt-2 text-sm">{c.suggestion}</div>
            </div>
          ))}
          {!classSugs.length && <div className="text-sm text-zinc-600">No class suggestions — load a week.</div>}
        </div>
      </section>

      {/* Student-level suggestions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Student Actions (Highest Risk First)</h2>
          <div className="text-xs text-zinc-600">Rules: very low attendance (&lt;60%), ≥2 ABSENT, (LATE+EXCUSED) ≥3, or NO_MARK ≥2</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border rounded-xl overflow-hidden">
            <thead className="bg-zinc-50">
              <tr className="text-left text-sm text-zinc-600">
                <th className="p-3 border-b">Student</th>
                <th className="p-3 border-b">Class</th>
                <th className="p-3 border-b">Sessions</th>
                <th className="p-3 border-b">P</th>
                <th className="p-3 border-b">A</th>
                <th className="p-3 border-b">L</th>
                <th className="p-3 border-b">E</th>
                <th className="p-3 border-b">NoMark</th>
                <th className="p-3 border-b">% Present</th>
                <th className="p-3 border-b">Issues</th>
                <th className="p-3 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {studentSugs.map(s => (
                <tr key={s.studentId} className="text-sm">
                  <td className="p-3 border-b font-semibold">{s.fullName}</td>
                  <td className="p-3 border-b">{s.classLabel}</td>
                  <td className="p-3 border-b">{s.sessions}</td>
                  <td className="p-3 border-b">{s.present}</td>
                  <td className="p-3 border-b">{s.absent}</td>
                  <td className="p-3 border-b">{s.late}</td>
                  <td className="p-3 border-b">{s.excused}</td>
                  <td className="p-3 border-b">{s.noMark}</td>
                  <td className={`p-3 border-b font-semibold ${pctClass(s.pctPresent)}`}>{s.pctPresent}%</td>
                  <td className="p-3 border-b">{s.issues.join(' / ') || '—'}</td>
                  <td className="p-3 border-b">
                    <div className="flex flex-wrap gap-2">
                      <a className={btnOutline + ' h-8 px-3 text-xs'}
                         href={`/headteacher/student/${encodeURIComponent(s.studentId)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}>
                        Open Profile
                      </a>
                      <a className={btnOutline + ' h-8 px-3 text-xs'}
                         href={`/headteacher/weekly/class/${encodeURIComponent(s.classroomId)}/roster?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}>
                        Class Roster
                      </a>
                    </div>
                    <div className="text-xs text-zinc-600 mt-1">{s.suggestion}</div>
                  </td>
                </tr>
              ))}
              {!studentSugs.length && (
                <tr><td className="p-4 text-sm text-zinc-600" colSpan={11}>No student suggestions — load a week.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}
    </div>
  )
}

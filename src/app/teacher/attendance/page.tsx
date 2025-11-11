// src/app/teacher/attendance/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type Student = {
  id: string
  firstName: string
  lastName: string
}

type Summary = {
  sessionId?: string
  state: 'NONE' | 'OPEN' | 'CLOSED' | 'CERTIFIED'
  date: string
  classroomId: string
  tenantId: string
  total: number
  present: number
  absent: number
  late: number
  excused: number
}

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`
const btnDanger = `${btnBase} bg-red-600 text-white border-red-600 hover:bg-red-700`
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`

// Health config
const FEVER_THRESHOLD = 37.8
const SYMPTOM_OPTIONS = ['Cough','Headache','Sore throat','Stomach ache','Other'] as const
type Symptom = typeof SYMPTOM_OPTIONS[number]

export default function TeacherAttendancePage() {
  const [tenantId, setTenantId] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const [students, setStudents] = useState<Student[]>([])
  const [marks, setMarks] = useState<Record<string, 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>>({})
  const [temps, setTemps] = useState<Record<string, number | undefined>>({})
  const [symptoms, setSymptoms] = useState<Record<string, Set<Symptom>>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [sendSms, setSendSms] = useState<boolean>(true)

  const [summary, setSummary] = useState<Summary | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [mode, setMode] = useState<'single' | 'multi'>('single')

  // bootstrap tenant
  useEffect(() => {
    ;(async () => {
      try {
        const tRes = await fetch('/api/test/tenants')
        const tJson = await tRes.json()
        const t = (tJson?.tenants && tJson.tenants[0]) || null
        if (t?.id) setTenantId(t.id)
      } catch {}
    })()
  }, [])

  // class options
  const [classOptions, setClassOptions] = useState<Array<{ id: string; label: string }>>([])
  const [classLoading, setClassLoading] = useState(false)
  const [classErr, setClassErr] = useState<string | null>(null)

  async function fetchClassOptions(tid: string, m: 'single' | 'multi') {
    setClassLoading(true); setClassErr(null)
    try {
      const url = `/api/classrooms/list?tenantId=${encodeURIComponent(tid)}&mode=${m}`
      const r = await fetch(url)
      const j = await r.json().catch(() => ({}))
      let items: Array<{ id: string; label: string }> = []
      if (r.ok && Array.isArray(j?.items)) {
        items = j.items.map((x: any) => ({ id: x.id, label: x.label || '' }))
      }
      setClassOptions(items)
      if (items.length) {
        if (!items.find(i => i.id === classroomId)) setClassroomId(items[0].id)
      } else { setClassroomId(''); setClassErr('No classrooms found. Use the seed buttons below.') }
    } catch { setClassErr('Failed to load classrooms.'); setClassOptions([]); setClassroomId('') }
    finally { setClassLoading(false) }
  }

  useEffect(() => { if (tenantId) fetchClassOptions(tenantId, mode) }, [tenantId, mode])

  async function seed(modeToSeed: 'single' | 'multi') {
    if (!tenantId) return
    setClassLoading(true); setClassErr(null)
    try {
      const r = await fetch('/api/classrooms/seed-canonical', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, mode: modeToSeed }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setClassErr(j?.error || 'Seed failed.')
      else await fetchClassOptions(tenantId, mode)
    } finally { setClassLoading(false) }
  }

  // load students
  useEffect(() => {
    if (!classroomId) { setStudents([]); return }
    ;(async () => {
      try {
        const r = await fetch(`/api/test/students?classroomId=${encodeURIComponent(classroomId)}`)
        const d = await r.json()
        setStudents((d?.students || []) as Student[])
      } catch { setStudents([]) }
    })()
  }, [classroomId])

  // summary
  async function refreshSummary() {
  if (!tenantId || !classroomId || !date) return
  const url = `/api/attendance/sessions/summary?tenantId=${encodeURIComponent(tenantId)}&classroomId=${encodeURIComponent(classroomId)}&date=${encodeURIComponent(date)}`
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))

  if (!r.ok || !j?.ok) {
    setSummary(null)
    setMsg(j?.error || `Failed to load summary (${r.status})`)
    return
  }

  // Map API shape -> UI shape the page expects
  const session = j.session || null
  const state: Summary['state'] =
    !session ? 'NONE'
    : session.certifiedAt ? 'CERTIFIED'
    : session.isClosed ? 'CLOSED'
    : 'OPEN'

  setSummary({
    sessionId: session?.id,
    state,
    date,
    classroomId,
    tenantId,
    total: j?.totals?.students ?? 0,
    present: j?.breakdown?.present ?? 0,
    absent: j?.breakdown?.absent ?? 0,
    late: j?.breakdown?.late ?? 0,
    excused: j?.breakdown?.excused ?? 0,
  })
}

  async function openSession() {
    if (!tenantId || !classroomId || !date) return
    setLoading(true); setMsg(null)
    try {
      const r = await fetch('/api/attendance/sessions/open', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, classroomId, date }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j?.error || 'Network or server error opening session.'); return }
      await refreshSummary()
    } finally { setLoading(false) }
  }

  // SAVE marks + health
  async function saveMarksAndHealth() {
    if (!students.length || !tenantId || !classroomId || !date) return
    setLoading(true); setMsg(null)
    try {
      // (1) Save marks
      const markItems = students.map(s => ({
        studentId: s.id,
        status: marks[s.id] || 'PRESENT',
        note: '',
      }))
      const r1 = await fetch('/api/attendance/marks/upsert', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, classroomId, date, items: markItems }),
      })
      const j1 = await r1.json().catch(() => ({}))
      if (!r1.ok) { setMsg(j1?.error || 'Save failed: Internal error saving marks.'); return }

      // (2) Save health
      const healthItems = students.map(s => {
        const set = symptoms[s.id]
        const sym = set ? Array.from(set).join(', ') : undefined
        const t = temps[s.id]
        return {
          studentId: s.id,
          temperatureC: typeof t === 'number' ? t : undefined,
          symptoms: sym,
          notes: notes[s.id] || undefined,
          sendSms, // honor toggle
        }
      })
      const r2 = await fetch('/api/health/student/daily/upsert', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, classroomId, date, items: healthItems }),
      })
      const j2 = await r2.json().catch(() => ({}))
      if (!r2.ok) { setMsg(j2?.error || 'Save failed: Internal error saving health.'); return }

      await refreshSummary()
      setMsg(`Saved ${markItems.length} marks and ${healthItems.length} health entries${sendSms ? ' (SMS queued)' : ''}.`)
    } finally { setLoading(false) }
  }

  async function closeSession() {
    if (!tenantId || !classroomId || !date) return
    setLoading(true); setMsg(null)
    try {
      const r = await fetch('/api/attendance/sessions/close', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, classroomId, date }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j?.error || 'Failed to close session.'); return }
      await refreshSummary()
      setMsg('Session closed.')
    } finally { setLoading(false) }
  }

  async function certifySession() {
    if (!tenantId || !classroomId || !date) return
    setLoading(true); setMsg(null)
    try {
      const r = await fetch('/api/attendance/sessions/certify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, classroomId, date }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j?.error || 'Certify failed: Failed to certify session'); return }
      await refreshSummary()
      setMsg('Session certified.')
    } finally { setLoading(false) }
  }

  async function reopenSession() {
    if (!tenantId || !classroomId || !date) return
    setLoading(true); setMsg(null)
    try {
      const r = await fetch('/api/attendance/sessions/reopen', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, classroomId, date }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j?.error || 'Failed to reopen session'); return }
      await refreshSummary()
      setMsg('Session reopened. You can edit marks now.')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (tenantId && classroomId && date) refreshSummary()
  }, [tenantId, classroomId, date])

  const presentPct = useMemo(() => {
    if (!summary) return 0
    const total = summary.total || 0
    if (!total) return 0
    return Math.round(((summary.present || 0) / total) * 100)
  }, [summary])

  function statusBadge(state?: Summary['state']) {
    const base = 'text-xs px-2 py-1 rounded-full border'
    if (state === 'CERTIFIED') return `${base} bg-indigo-50 border-indigo-200 text-indigo-900`
    if (state === 'CLOSED') return `${base} bg-red-50 border-red-200 text-red-900`
    if (state === 'OPEN') return `${base} bg-yellow-50 border-yellow-200`
    return `${base} bg-gray-50 border-gray-200`
  }

  function setAll(status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED') {
    const next: Record<string, 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'> = {}
    for (const s of students) next[s.id] = status
    setMarks(next)
  }

  function toggleSym(studentId: string, opt: Symptom) {
    setSymptoms(prev => {
      const set = new Set(prev[studentId] || [])
      if (set.has(opt)) set.delete(opt)
      else set.add(opt)
      return { ...prev, [studentId]: set }
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Teacher — Attendance + Daily Health</h1>
      <p className="text-sm text-zinc-600">Open → Mark → Health → Save → Close → Certify. Parents get SMS (stub) with temperature and symptoms if enabled.</p>

      {/* Date + Class selection card */}
      <div className="border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-sm font-semibold">Class Selection</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-600">Mode:</span>
            <button className={`${btnOutline} h-8 px-3 ${mode === 'single' ? 'ring-2 ring-zinc-800' : ''}`} onClick={() => setMode('single')}>Single</button>
            <button className={`${btnOutline} h-8 px-3 ${mode === 'multi' ? 'ring-2 ring-zinc-800' : ''}`} onClick={() => setMode('multi')}>Multi (A–D)</button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input className="w-full border rounded-xl p-2 h-10" value={date} onChange={e => setDate(e.target.value)} type="date" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Classroom</label>
            {classLoading ? (
              <div className="h-10 rounded-xl border bg-zinc-50 animate-pulse" />
            ) : classOptions.length ? (
              <select className="w-full border rounded-xl p-2 h-10" value={classroomId} onChange={e => setClassroomId(e.target.value)}>
                {classOptions.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
              </select>
            ) : (
              <div className="border rounded-xl p-3">
                <div className="text-sm text-zinc-700 mb-2">{classErr || 'No classrooms available.'}</div>
                <div className="flex flex-wrap gap-2">
                  <button className={btnOutline} onClick={() => seed('single')} disabled={!tenantId || classLoading}>Seed single-stream (KG1 → JHS3)</button>
                  <button className={btnOutline} onClick={() => seed('multi')} disabled={!tenantId || classLoading}>Seed multi-stream (A–D)</button>
                  <button className={btnOutline} onClick={() => tenantId && fetchClassOptions(tenantId, mode)} disabled={!tenantId || classLoading}>Reload classes</button>
                </div>
                <div className="text-xs text-zinc-500 mt-2">Toggle the mode above, then “Reload classes”.</div>
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <button className={btnPrimary + ' w-full'} onClick={refreshSummary} disabled={loading || !tenantId || !classroomId || !date}>Refresh</button>
            <button className={btnOutline + ' w-full'} onClick={() => { setMarks({}); setTemps({}); setSymptoms({}); setNotes({}); setMsg('Cleared local marks + health inputs'); }}>Clear</button>
          </div>
        </div>

        {/* Always available seeding */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btnOutline} onClick={() => seed('single')} disabled={!tenantId || classLoading}>Seed single-stream (KG1 → JHS3)</button>
          <button className={btnOutline} onClick={() => seed('multi')} disabled={!tenantId || classLoading}>Seed multi-stream (A–D)</button>
          <button className={btnOutline} onClick={() => tenantId && fetchClassOptions(tenantId, mode)} disabled={!tenantId || classLoading}>Reload classes</button>
        </div>
      </div>

      {/* Session state + actions */}
      <div className="border rounded-xl p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm text-zinc-600">State</div>
            <div className="text-base">
              <span className={statusBadge(summary?.state)}>{summary?.state || 'NONE'}</span>
              <span className="ml-3 text-sm text-zinc-700">
                Present: <b>{summary?.present ?? 0}</b> / {summary?.total ?? 0} (<b>{presentPct}%</b>)
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={openSession} disabled={loading || !tenantId || !classroomId || !date}>Open Session</button>
            <button className={btnOutline} onClick={saveMarksAndHealth} disabled={loading || !students.length}>Save Marks + Health</button>
            <button className={btnDanger} onClick={closeSession} disabled={loading || !summary || summary.state !== 'OPEN'}>Close Session</button>
            <button className={btnPrimary} onClick={certifySession} disabled={loading || !summary || summary.state !== 'CLOSED'}>Certify Session</button>
            <button className={btnOutline} onClick={reopenSession} disabled={loading || !summary || summary.state !== 'CLOSED'} title="Reopen if the session is closed but not yet certified">Reopen Session</button>

            {/* SMS toggle */}
            <label className="ml-2 inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} />
              Send parent SMS (stub)
            </label>
          </div>
        </div>
      </div>

      {/* Marking grid + Health */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button className={btnOutline + ' h-9'} onClick={() => setAll('PRESENT')}>Mark All Present</button>
          <button className={btnOutline + ' h-9'} onClick={() => setAll('ABSENT')}>Mark All Absent</button>
          <button className={btnOutline + ' h-9'} onClick={() => setAll('LATE')}>Mark All Late</button>
          <button className={btnOutline + ' h-9'} onClick={() => setAll('EXCUSED')}>Mark All Excused</button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border rounded-xl overflow-hidden">
            <thead className="bg-zinc-50">
              <tr className="text-left text-sm text-zinc-600">
                <th className="p-3 border-b">Student</th>
                <th className="p-3 border-b">Present</th>
                <th className="p-3 border-b">Absent</th>
                <th className="p-3 border-b">Late</th>
                <th className="p-3 border-b">Excused</th>
                <th className="p-3 border-b">Temp (°C)</th>
                <th className="p-3 border-b">Symptoms</th>
                <th className="p-3 border-b">Notes</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => {
                const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ')
                const current = marks[s.id] || 'PRESENT'
                const tVal = temps[s.id]
                const fever = typeof tVal === 'number' && tVal >= FEVER_THRESHOLD
                const set = symptoms[s.id] || new Set<Symptom>()
                return (
                  <tr key={s.id} className="text-sm align-top">
                    <td className="p-3 border-b font-semibold">
                      {fullName}
                      {fever && (
                        <div className="mt-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 inline-block">
                          Fever ≥ {FEVER_THRESHOLD}°C — will notify parent
                        </div>
                      )}
                    </td>
                    <td className="p-3 border-b">
                      <input type="radio" name={`m-${s.id}`} checked={current === 'PRESENT'} onChange={() => setMarks(m => ({ ...m, [s.id]: 'PRESENT' }))} />
                    </td>
                    <td className="p-3 border-b">
                      <input type="radio" name={`m-${s.id}`} checked={current === 'ABSENT'} onChange={() => setMarks(m => ({ ...m, [s.id]: 'ABSENT' }))} />
                    </td>
                    <td className="p-3 border-b">
                      <input type="radio" name={`m-${s.id}`} checked={current === 'LATE'} onChange={() => setMarks(m => ({ ...m, [s.id]: 'LATE' }))} />
                    </td>
                    <td className="p-3 border-b">
                      <input type="radio" name={`m-${s.id}`} checked={current === 'EXCUSED'} onChange={() => setMarks(m => ({ ...m, [s.id]: 'EXCUSED' }))} />
                    </td>
                    <td className="p-3 border-b">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={34}
                        max={42}
                        className={`w-24 border rounded-lg p-1 ${fever ? 'border-red-400 ring-1 ring-red-300' : ''}`}
                        value={typeof tVal === 'number' ? tVal : ''}
                        placeholder="e.g. 36.7"
                        onChange={e => {
                          const v = e.target.value
                          const num = v === '' ? undefined : Number(v)
                          setTemps(prev => ({ ...prev, [s.id]: num }))
                        }}
                      />
                    </td>
                    <td className="p-3 border-b">
                      <div className="flex flex-wrap gap-2 max-w-[380px]">
                        {SYMPTOM_OPTIONS.map(opt => (
                          <label key={opt} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${set.has(opt) ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-800 border-zinc-300'}`}>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={set.has(opt)}
                              onChange={() => toggleSym(s.id, opt)}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 border-b">
                      <input
                        type="text"
                        className="w-48 border rounded-lg p-1"
                        value={notes[s.id] || ''}
                        placeholder="Optional note"
                        onChange={e => setNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                )
              })}
              {!students.length && (
                <tr><td className="p-4 text-sm text-zinc-600" colSpan={8}>No students found for this class.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {msg && <div className="text-sm text-zinc-700">{msg}</div>}
    </div>
  )
}

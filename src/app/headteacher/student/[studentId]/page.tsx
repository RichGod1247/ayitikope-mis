// src/app/headteacher/student/[studentId]/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { fetchActiveTenant } from '@/lib/client/activeTenant'

type Item = { date: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'NO_MARK'; note: string }

type MockAggregate = {
  ok: boolean
  aggregate: number | null
  missingSubjects: string[]
  reason: string | null
}

type MockReadinessBand = {
  code: string
  label: string
  tone: string
  action: string
}

type MockSubjectSignal = {
  itemId: string
  subject: string
  canonicalSubject: string
  title: string
  maxScore: number
  status: string
  score: number | null
  comment: string | null
  grade: number | null
  gradeLabel: string | null
  remark: string | null
  nextGrade: number | null
  pointsToNextGrade: number | null
}

type MockReadiness = {
  available: boolean
  reason: string | null
  session: {
    id: string
    classroomId: string
    academicYear: string
    term: string | null
    mockNumber: number
    mockLabel: string
    title: string
    status: string
    date: string | null
  } | null
  averageScore: number | null
  scoredSubjectCount: number
  missingSubjectCount: number
  schoolAggregate: MockAggregate | null
  placementAggregate: MockAggregate | null
  readiness: MockReadinessBand | null
  missingSubjects: string[]
  weakSubjects: MockSubjectSignal[]
  strongSubjects: MockSubjectSignal[]
  nearGradeOpportunities: MockSubjectSignal[]
  subjects?: MockSubjectSignal[]
  nextAction: string
  cockpitHref?: string | null
}

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const btnPrimary = `${btnBase} border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] hover:brightness-105`

const btnOutline = `${btnBase} border-white/10 bg-white/[0.04] text-[#F7F4ED] hover:bg-white/[0.08]`

const shellCard =
  'rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl'

const softPanel = 'rounded-2xl border border-white/10 bg-white/[0.04]'

const darkInput =
  'w-full rounded-xl border border-white/10 bg-[#07111F] p-2 h-10 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25'

export default function StudentDetailPage() {
  const params = useParams<{ studentId: string }>()
  const qs = useSearchParams()
  const studentId = params.studentId

  const [tenantId, setTenantId] = useState('')
  const [start, setStart] = useState(qs.get('start') || '')
  const [end, setEnd] = useState(qs.get('end') || '')
  const [items, setItems] = useState<Item[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [fullName, setFullName] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [sessions, setSessions] = useState(0)
  const [present, setPresent] = useState(0)
  const [absent, setAbsent] = useState(0)
  const [late, setLate] = useState(0)
  const [excused, setExcused] = useState(0)
  const [noMark, setNoMark] = useState(0)
  const [pctPresent, setPctPresent] = useState(0)
  const [mockReadiness, setMockReadiness] = useState<MockReadiness | null>(null)
  const [autoLoaded, setAutoLoaded] = useState(false)

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

      const { start: s, end: e } = weekRangeMonFri(qs.get('date') ?? todayYYYYMMDD())
      if (!qs.get('start')) setStart(s)
      if (!qs.get('end')) setEnd(e)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

useEffect(() => {
  if (autoLoaded) return
  if (!studentId || !start || !end) return

  setAutoLoaded(true)
  void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [studentId, start, end, autoLoaded])

  async function load() {
    if (!studentId || !start || !end)
 {
      setMsg('Missing inputs')
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      const url = `/api/headteacher/student/detail?studentId=${encodeURIComponent(
  studentId
)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(data?.error || `Failed to load (${res.status})`)
        setItems([])
        setMockReadiness(null)
        return
      }

      setFullName(data?.meta?.fullName || '')
      setGuardianName(data?.meta?.guardianName || '')
      setGuardianPhone(data?.meta?.guardianPhone || '')
      setSessions(data?.meta?.sessions || 0)
      setPresent(data?.meta?.present || 0)
      setAbsent(data?.meta?.absent || 0)
      setLate(data?.meta?.late || 0)
      setExcused(data?.meta?.excused || 0)
      setNoMark(data?.meta?.noMark || 0)
      setPctPresent(data?.meta?.pctPresent || 0)
      setItems((data?.items || []) as Item[])
      setMockReadiness((data?.mockReadiness || null) as MockReadiness | null)
    } finally {
      setLoading(false)
    }
  }

  const exportURL = useMemo(() => {
    if (!tenantId || !start || !end) return ''
    return `/api/headteacher/export-csv-range?tenantId=${encodeURIComponent(tenantId)}&start=${encodeURIComponent(
      start
    )}&end=${encodeURIComponent(end)}`
  }, [tenantId, start, end])

function badge(status: Item['status']) {
  const base = 'inline-flex rounded-full border px-2 py-1 text-xs font-semibold'

  if (status === 'PRESENT') return `${base} border-emerald-300/20 bg-emerald-400/12 text-emerald-100`
  if (status === 'ABSENT') return `${base} border-rose-300/20 bg-rose-400/12 text-rose-100`
  if (status === 'LATE') return `${base} border-amber-300/20 bg-amber-400/12 text-amber-100`
  if (status === 'EXCUSED') return `${base} border-indigo-300/20 bg-indigo-400/12 text-indigo-100`

  return `${base} border-white/10 bg-white/[0.04] text-[#C9CDD6]`
}

  const defaultWeek = weekRangeMonFri(todayYYYYMMDD())

function fmt(value: number | null | undefined, suffix = '') {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 1)}${suffix}`
}

function readinessBadge(code?: string | null) {
  const c = String(code || '').toUpperCase()
  const base = 'inline-flex rounded-full border px-2 py-1 text-xs font-semibold'

  if (c.includes('READY') || c === 'EXCELLENT' || c === 'COMPETITIVE') {
    return `${base} border-emerald-300/20 bg-emerald-400/12 text-emerald-100`
  }

  if (c.includes('RISK') || c === 'CRITICAL' || c === 'INCOMPLETE') {
    return `${base} border-rose-300/20 bg-rose-400/12 text-rose-100`
  }

  if (c === 'DEVELOPING' || c === 'MODERATE') {
    return `${base} border-amber-300/20 bg-amber-400/12 text-amber-100`
  }

  return `${base} border-white/10 bg-white/[0.04] text-[#C9CDD6]`
}

function scoreBadge(score: number | null) {
  const base = 'inline-flex rounded-full border px-2 py-1 text-xs font-semibold'

  if (score == null) return `${base} border-white/10 bg-white/[0.04] text-[#C9CDD6]`
  if (score < 50) return `${base} border-rose-300/20 bg-rose-400/12 text-rose-100`
  if (score < 60) return `${base} border-amber-300/20 bg-amber-400/12 text-amber-100`

  return `${base} border-emerald-300/20 bg-emerald-400/12 text-emerald-100`
}

const shouldFocusMock = qs.get('focus') === 'mock-readiness'

    return (
    <main className="min-h-screen bg-[#06101F] text-[#F7F4ED]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.22),transparent_28%),linear-gradient(135deg,#071A3D,#0B1220_58%,#07111F)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#E8C96A]">
                EduLife OS • Headteacher Learner Command
              </div>

              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                Learner Command Profile
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                <span className="font-semibold text-[#F7F4ED]">{fullName || 'Student'}</span>
                {' '}— Guardian: {guardianName || '—'} ({guardianPhone || '—'})
              </p>

              {shouldFocusMock ? (
                <div className="mt-3 inline-flex rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">
                  Focus mode: BECE Mock readiness
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {mockReadiness?.cockpitHref ? (
                <a className={btnPrimary} href={mockReadiness.cockpitHref}>
                  Open Mock cockpit
                </a>
              ) : null}

              <a className={btnOutline} href="/headteacher/weekly">
                Weekly overview
              </a>
            </div>
          </div>
        </section>

        <section
          className={[
            shellCard,
            shouldFocusMock ? 'ring-2 ring-amber-300/20' : '',
          ].join(' ')}
        >
          <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#E8C96A]">
                BECE Mock Readiness Dossier
              </div>

              <h2 className="mt-1 text-xl font-semibold text-white">
                Candidate rescue profile
              </h2>

              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                Headteacher-only view of the learner’s latest Mock evidence, aggregate risk,
                missing subjects, weak subjects, strengths, and next rescue action.
              </p>
            </div>

            {mockReadiness?.session ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[#C9CDD6]">
                <div className="font-semibold text-[#F7F4ED]">{mockReadiness.session.title}</div>
                <div className="mt-1 text-xs">
                  {mockReadiness.session.mockLabel} • {mockReadiness.session.academicYear} • {mockReadiness.session.status}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 px-4 py-4">
            {!mockReadiness ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.04] p-5 text-sm text-[#C9CDD6]">
                Loading learner Mock readiness dossier…
              </div>
            ) : !mockReadiness.available ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-5 text-sm text-amber-100">
                {mockReadiness.reason || 'No Mock readiness evidence is available yet.'}
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-5">
                  <div className={softPanel + ' p-4'}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#8F98A8]">Average</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{fmt(mockReadiness.averageScore)}</div>
                  </div>

                  <div className={softPanel + ' p-4'}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#8F98A8]">School aggregate</div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {mockReadiness.schoolAggregate?.aggregate ?? 'Incomplete'}
                    </div>
                  </div>

                  <div className={softPanel + ' p-4'}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#8F98A8]">Placement aggregate</div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {mockReadiness.placementAggregate?.aggregate ?? 'Incomplete'}
                    </div>
                  </div>

                  <div className={softPanel + ' p-4'}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#8F98A8]">Scored</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {mockReadiness.scoredSubjectCount} scored
                    </div>
                    <div className="mt-1 text-xs text-[#AEB6C4]">
                      {mockReadiness.missingSubjectCount} missing
                    </div>
                  </div>

                  <div className={softPanel + ' p-4'}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#8F98A8]">Readiness</div>
                    <div className="mt-2">
                      <span className={readinessBadge(mockReadiness.readiness?.code)}>
                        {mockReadiness.readiness?.label || 'Incomplete'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100">
                  <span className="font-semibold">Next rescue action: </span>
                  {mockReadiness.nextAction}
                </div>

                {mockReadiness.missingSubjects.length > 0 ? (
                  <div className={softPanel + ' p-4'}>
                    <div className="text-sm font-semibold text-white">Missing evidence</div>
                    <p className="mt-1 text-xs text-[#AEB6C4]">
                      These subjects are blocking complete aggregate judgment.
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {mockReadiness.missingSubjects.map((subject) => (
                        <span
                          key={`missing:${subject}`}
                          className="rounded-full border border-rose-300/20 bg-rose-400/12 px-2 py-1 text-xs font-semibold text-rose-100"
                        >
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                  <div className={softPanel + ' p-4'}>
                    <div className="text-sm font-semibold text-white">Weak subjects</div>
                    <p className="mt-1 text-xs text-[#AEB6C4]">
                      Immediate remediation priorities.
                    </p>

                    <div className="mt-3 space-y-2">
                      {mockReadiness.weakSubjects.length === 0 ? (
                        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-100">
                          No subject below 50.
                        </div>
                      ) : (
                        mockReadiness.weakSubjects.map((subject) => (
                          <div
                            key={`weak:${subject.itemId}`}
                            className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#07111F]/80 px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-[#F7F4ED]">{subject.subject}</span>
                            <span className={scoreBadge(subject.score)}>{fmt(subject.score)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={softPanel + ' p-4'}>
                    <div className="text-sm font-semibold text-white">Fast improvement</div>
                    <p className="mt-1 text-xs text-[#AEB6C4]">
                      Subjects close to the next grade threshold.
                    </p>

                    <div className="mt-3 space-y-2">
                      {mockReadiness.nearGradeOpportunities.length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-[#07111F]/80 px-3 py-3 text-sm text-[#C9CDD6]">
                          No near-grade opportunity within 5 marks.
                        </div>
                      ) : (
                        mockReadiness.nearGradeOpportunities.map((subject) => (
                          <div
                            key={`near:${subject.itemId}`}
                            className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm"
                          >
                            <div className="font-medium text-white">{subject.subject}</div>
                            <div className="mt-1 text-xs text-amber-100">
                              {subject.pointsToNextGrade} mark(s) to Grade {subject.nextGrade}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={softPanel + ' p-4'}>
                    <div className="text-sm font-semibold text-white">Strengths to protect</div>
                    <p className="mt-1 text-xs text-[#AEB6C4]">
                      Subjects already showing Grade 1–3 strength.
                    </p>

                    <div className="mt-3 space-y-2">
                      {mockReadiness.strongSubjects.length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-[#07111F]/80 px-3 py-3 text-sm text-[#C9CDD6]">
                          No Grade 1–3 strength yet.
                        </div>
                      ) : (
                        mockReadiness.strongSubjects.map((subject) => (
                          <div
                            key={`strong:${subject.itemId}`}
                            className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#07111F]/80 px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-[#F7F4ED]">{subject.subject}</span>
                            <span className={scoreBadge(subject.score)}>{subject.gradeLabel || '—'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {mockReadiness.subjects?.length ? (
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-white/[0.05] text-[#AEB6C4]">
                        <tr>
                          <th className="border-b border-white/10 p-3">Subject</th>
                          <th className="border-b border-white/10 p-3">Score</th>
                          <th className="border-b border-white/10 p-3">Grade</th>
                          <th className="border-b border-white/10 p-3">Next grade gap</th>
                          <th className="border-b border-white/10 p-3">Remark</th>
                        </tr>
                      </thead>

                      <tbody>
                        {mockReadiness.subjects.map((subject) => (
                          <tr key={subject.itemId} className="border-b border-white/5">
                            <td className="p-3 font-medium text-[#F7F4ED]">{subject.subject}</td>
                            <td className="p-3">
                              <span className={scoreBadge(subject.score)}>{fmt(subject.score)}</span>
                            </td>
                            <td className="p-3 text-[#C9CDD6]">{subject.gradeLabel || '—'}</td>
                            <td className="p-3 text-[#C9CDD6]">
                              {subject.pointsToNextGrade == null
                                ? '—'
                                : `${subject.pointsToNextGrade} to Grade ${subject.nextGrade}`}
                            </td>
                            <td className="p-3 text-[#C9CDD6]">{subject.remark || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className={shellCard}>
          <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#8F98A8]">
                Attendance Audit
              </div>

              <h2 className="mt-1 text-xl font-semibold text-white">
                Weekly attendance record
              </h2>

              <p className="mt-1 text-sm text-[#AEB6C4]">
                Review the learner’s attendance for the selected Monday–Friday range.
              </p>
            </div>

            <a className={`${btnOutline} ${exportURL ? '' : 'pointer-events-none opacity-50'}`} href={exportURL}>
              Download School CSV
            </a>
          </div>

          <div className="space-y-4 px-4 py-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#AEB6C4]">Start (Mon)</label>
                <div className="flex gap-2">
                  <input
                    className={darkInput}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    placeholder={defaultWeek.start}
                  />
                  <button className={btnOutline} onClick={() => setStart(defaultWeek.start)}>
                    This Mon
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#AEB6C4]">End (Fri)</label>
                <div className="flex gap-2">
                  <input
                    className={darkInput}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    placeholder={defaultWeek.end}
                  />
                  <button className={btnOutline} onClick={() => setEnd(defaultWeek.end)}>
                    This Fri
                  </button>
                </div>
              </div>

              <div className="flex items-end">
                <button className={btnPrimary + ' w-full'} onClick={load} disabled={loading || !tenantId || !start || !end}>
                  {loading ? 'Loading…' : 'Load Week'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-7">
              <div className={softPanel + ' p-3'}>
                <div className="text-[#8F98A8]">Sessions</div>
                <div className="font-semibold text-white">{sessions}</div>
              </div>
              <div className={softPanel + ' p-3'}>
                <div className="text-[#8F98A8]">Present</div>
                <div className="font-semibold text-white">{present}</div>
              </div>
              <div className={softPanel + ' p-3'}>
                <div className="text-[#8F98A8]">Absent</div>
                <div className="font-semibold text-white">{absent}</div>
              </div>
              <div className={softPanel + ' p-3'}>
                <div className="text-[#8F98A8]">Late</div>
                <div className="font-semibold text-white">{late}</div>
              </div>
              <div className={softPanel + ' p-3'}>
                <div className="text-[#8F98A8]">Excused</div>
                <div className="font-semibold text-white">{excused}</div>
              </div>
              <div className={softPanel + ' p-3'}>
                <div className="text-[#8F98A8]">No mark</div>
                <div className="font-semibold text-white">{noMark}</div>
              </div>
              <div className={softPanel + ' p-3'}>
                <div className="text-[#8F98A8]">% Present</div>
                <div className="font-semibold text-white">{pctPresent}%</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/[0.05] text-[#AEB6C4]">
                  <tr>
                    <th className="border-b border-white/10 p-3">Date</th>
                    <th className="border-b border-white/10 p-3">Status</th>
                    <th className="border-b border-white/10 p-3">Note</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((i) => (
                    <tr key={i.date} className="border-b border-white/5">
                      <td className="p-3 text-[#F7F4ED]">{i.date}</td>
                      <td className="p-3">
                        <span className={badge(i.status)}>{i.status}</span>
                      </td>
                      <td className="p-3 text-[#C9CDD6]">{i.note || '—'}</td>
                    </tr>
                  ))}

                  {!items.length && (
                    <tr>
                      <td className="p-4 text-sm text-[#AEB6C4]" colSpan={3}>
                        No attendance data loaded yet. Choose dates and click Load Week.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {msg ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#C9CDD6]">
                {msg}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}

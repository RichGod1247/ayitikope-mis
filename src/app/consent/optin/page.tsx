'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  healthConsentAt: string | null;
  smsOptIn: boolean;
};

type Tenant = { id: string; name: string; slug: string };

const btnBase =
  'inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

export default function GuardianOptInPage() {
  const sp = useSearchParams();
  const tenantId = sp.get('tenantId') || '';
  const studentId = sp.get('studentId') || '';

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load tenant (for branding + logo)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/test/tenants', { cache: 'no-store' });
        const j = await r.json();
        const list: Tenant[] = j?.tenants || [];
        const t = list.find((x) => x.id === tenantId) || list[0] || null;
        setTenant(t || null);
      } catch {
        setTenant(null);
      }
    })();
  }, [tenantId]);

  // Load target student (we reuse the list endpoint and filter client-side)
  useEffect(() => {
    if (!tenantId || !studentId) return;
    (async () => {
      try {
        const r = await fetch(`/api/consent/students/list?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
        const j = await r.json();
        const all: any[] = j?.items || [];
        const s = all.find((x) => x.id === studentId) || null;
        setStudent(
          s
            ? {
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                guardianName: s.guardianName ?? null,
                guardianPhone: s.guardianPhone ?? null,
                healthConsentAt: s.healthConsentAt ?? null,
                smsOptIn: Boolean(
                  typeof s.smsOptIn === 'boolean' ? s.smsOptIn : s.guardianSmsOptIn
                ),
              }
            : null
        );
      } catch (e: any) {
        setError(e?.message || 'Failed to load student');
      }
    })();
  }, [tenantId, studentId]);

  const schoolLogoSrc = useMemo(() => {
    const slug = tenant?.slug || 'default';
    return `/logos/${slug}.png`;
  }, [tenant?.slug]);

  async function handleOptIn() {
    if (!tenantId || !studentId) return;
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const r = await fetch('/api/consent/optin/student', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          studentId,
          setConsentNow: true, // record consent timestamp
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || 'Failed to save consent');
      }
      setMsg('Thank you! Consent saved and SMS opt-in enabled.');
      // refresh student in UI
      setStudent((prev) => (prev ? { ...prev, smsOptIn: true, healthConsentAt: new Date().toISOString() } : prev));
    } catch (e: any) {
      setError(e?.message || 'Could not save consent');
    } finally {
      setLoading(false);
    }
  }

  async function handleDecline() {
    if (!tenantId || !studentId) return;
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const r = await fetch('/api/consent/optout/student', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, studentId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || 'Failed to record decline');
      }
      setMsg('Preference saved. You will not receive SMS updates.');
      setStudent((prev) => (prev ? { ...prev, smsOptIn: false } : prev));
    } catch (e: any) {
      setError(e?.message || 'Could not record decline');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top band / branding */}
      <div className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* Logo (non-interactive; no onError handler to keep Server/Client happy) */}
          <img src={schoolLogoSrc} alt="School logo" className="h-10 w-10 object-contain rounded" />
          <div>
            <div className="text-lg font-semibold">{tenant?.name || 'Your School'}</div>
            <div className="text-xs text-zinc-600">Guardian Consent & SMS Preferences</div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-5">
        {!tenantId || !studentId ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Missing link information. Please use the official SMS link sent by the school.
          </div>
        ) : !student ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Loading student…
          </div>
        ) : (
          <>
            <div className="rounded-2xl border p-4">
              <div className="text-sm text-zinc-600 mb-2">Student</div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    {student.lastName} {student.firstName}
                  </div>
                  <div className="text-sm text-zinc-700">
                    Guardian: {student.guardianName || '—'} · {student.guardianPhone || '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500">Consent on file</div>
                  <div className="text-sm">
                    {student.healthConsentAt ? new Date(student.healthConsentAt).toLocaleString() : '—'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">SMS Opt-in</div>
                  <div className="text-sm">{student.smsOptIn ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </div>

            {/* Explainer */}
            <div className="rounded-2xl border p-4">
              <div className="text-sm text-zinc-700">
                By consenting, you allow the school to record basic daily health data
                (temperature & symptoms when applicable) and to send important updates via SMS.
                Data is protected under the school’s privacy policy and used to support your child’s well-being.
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button className={btnPrimary} onClick={handleOptIn} disabled={loading}>
                {loading ? 'Saving…' : 'I Consent & Opt-in to SMS'}
              </button>
              <button className={btnOutline} onClick={handleDecline} disabled={loading}>
                I Decline SMS
              </button>
              <Link href="/headteacher/consent" className={btnOutline}>
                Back to School Portal
              </Link>
            </div>

            {msg && <div className="text-sm text-emerald-700">{msg}</div>}
            {error && <div className="text-sm text-red-700">{error}</div>}
          </>
        )}
      </div>

      <div className="max-w-3xl mx-auto p-4">
        <div className="text-xs text-zinc-500">
          Need help? Visit the school office or contact the head teacher.
        </div>
      </div>
    </div>
  );
}

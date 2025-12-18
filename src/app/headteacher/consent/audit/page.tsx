'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Tenant = { id: string; name: string; slug: string };
type AuditItem = {
  id?: string;
  createdAt?: string;
  tenantId?: string;
  channel?: string;        // e.g., "SMS"
  action?: string;         // e.g., "OUTBOUND_SMS_SEND"
  to?: string;             // some APIs might use 'to'
  toPhone?: string;        // others might use 'toPhone'
  smsBody?: string;        // body fields may vary
  body?: string;
  message?: string;
  preview?: string;
  purpose?: string;        // e.g., "CONSENT_CAMPAIGN"
  meta?: any;              // whatever else your API returns
};

function cx(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

/** Small panel that shows last 20 campaign SMS sends */
function CampaignSendsPanel({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      // Pull enough items to filter client-side if necessary
      const res = await fetch(
        `/api/consent/audit/list?tenantId=${encodeURIComponent(tenantId)}&limit=50`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to load audit list');
      const data = await res.json();
      const raw: AuditItem[] = Array.isArray(data?.items) ? data.items : [];

      // Prefer explicit campaign purpose when available
      const withPurpose = raw.filter(
        (r) =>
          r?.purpose === 'CONSENT_CAMPAIGN' ||
          r?.meta?.purpose === 'CONSENT_CAMPAIGN'
      );

      const picked = (withPurpose.length ? withPurpose : raw)
        .filter(
          (r) =>
            ((r?.channel || '').toUpperCase() === 'SMS') ||
            (r?.action === 'OUTBOUND_SMS_SEND')
        )
        .slice(0, 20);

      setItems(picked);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Last 20 Campaign Sends</h2>
        <button
          className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="text-left">
            <tr className="border-b bg-gray-50">
              <th className="p-2">When</th>
              <th className="p-2">To</th>
              <th className="p-2">Channel</th>
              <th className="p-2">Preview</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, idx) => {
              const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : '—';
              const to = r.to || r.toPhone || '—';
              const ch = (r.channel || r.action || '—').toString().toUpperCase();
              const preview =
                r.smsBody || r.body || r.message || r.preview || '(no body)';
              return (
                <tr key={r.id || idx} className="border-b">
                  <td className="p-2">{when}</td>
                  <td className="p-2">{to}</td>
                  <td className="p-2">{ch}</td>
                  <td className="p-2 wrap-break-word">
                    {String(preview).slice(0, 140)}
                    {String(preview).length > 140 ? '…' : ''}
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  No campaign sends found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Generic audit table (kept simple & resilient to schema differences) */
function AllAuditTable({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/consent/audit/list?tenantId=${encodeURIComponent(tenantId)}&limit=100`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to load audit list');
      const data = await res.json();
      const raw: AuditItem[] = Array.isArray(data?.items) ? data.items : [];
      setItems(raw);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Audit Log (latest 100)</h2>
        <button
          className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="text-left">
            <tr className="border-b bg-gray-50">
              <th className="p-2">When</th>
              <th className="p-2">Channel / Action</th>
              <th className="p-2">To</th>
              <th className="p-2">Preview</th>
              <th className="p-2">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, idx) => {
              const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : '—';
              const ch = (r.channel || r.action || '—').toString();
              const to = r.to || r.toPhone || '—';
              const preview =
                r.smsBody || r.body || r.message || r.preview || '(no body)';
              const purpose = r.purpose || r.meta?.purpose || '—';
              return (
                <tr key={r.id || idx} className="border-b">
                  <td className="p-2">{when}</td>
                  <td className="p-2">{ch}</td>
                  <td className="p-2">{to}</td>
                  <td className="p-2 wrap-break-word">
                    {String(preview).slice(0, 160)}
                    {String(preview).length > 160 ? '…' : ''}
                  </td>
                  <td className="p-2">{purpose}</td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  No audit entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');

  // Load tenants
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/test/tenants', { cache: 'no-store' });
        const data = await res.json();
        const list = (data?.tenants ?? []) as Tenant[];
        setTenants(list);
        if (!tenantId && list.length > 0) {
          setTenantId(list[0].id);
        }
      } catch {
        // silent
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTenant = useMemo(
    () => tenants.find((t) => t.id === tenantId),
    [tenants, tenantId]
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header / toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Consent Audit</h1>
          <p className="text-sm text-gray-500">
            Review of consent actions, SMS outreach, and related activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Tenant</label>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            title="Tenant"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Campaign sends panel */}
      {tenantId && <CampaignSendsPanel tenantId={tenantId} />}

      {/* Full audit table */}
      {tenantId && <AllAuditTable tenantId={tenantId} />}
    </div>
  );
}

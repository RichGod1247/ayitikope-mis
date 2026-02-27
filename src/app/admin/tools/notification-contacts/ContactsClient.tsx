"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { NotificationContactDTO as Contact } from "./types";

type ListResp =
  | { ok: true; contacts: Contact[] }
  | { ok: false; error: string };

export default function ContactsClient() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchContacts() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/notification-contacts", {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as ListResp | null;

      if (!res.ok || !json || !json.ok) {
        const msg =
          (json && !json.ok && json.error) ||
          "Could not load contacts. Database may be offline.";
        setContacts([]);
        setError(msg);
        return;
      }

      setContacts(Array.isArray(json.contacts) ? json.contacts : []);
    } catch (e: any) {
      setContacts([]);
      setError(e?.message ?? "Network error while loading contacts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchContacts();
  }, []);

  async function updateContact(
    id: string,
    payload: Partial<Pick<Contact, "name" | "phone" | "isActive">>
  ) {
    setSavingId(id);
    setError(null);

    try {
      const res = await fetch(`/api/admin/notification-contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Update failed (${res.status}): ${txt.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        ok: boolean;
        contact?: Contact;
        error?: string;
      };

      if (!data.ok || !data.contact) {
        throw new Error(data.error ?? "Unknown error updating contact.");
      }

      setContacts((prev) => prev.map((c) => (c.id === id ? data.contact! : c)));
    } catch (err: any) {
      console.error("Update contact error:", err);
      setError(err?.message ?? "Unknown update error");
    } finally {
      setSavingId(null);
    }
  }

  function handleToggleActive(c: Contact) {
    updateContact(c.id, { isActive: !c.isActive });
  }

  function handleEdit(contact: Contact) {
    const newName = window.prompt("Edit name:", contact.name);
    if (newName === null) return;

    const newPhone = window.prompt("Edit phone:", contact.phone);
    if (newPhone === null) return;

    const trimmedName = newName.trim();
    const trimmedPhone = newPhone.trim();

    if (!trimmedName || !trimmedPhone) {
      alert("Name and phone cannot be empty.");
      return;
    }

    updateContact(contact.id, { name: trimmedName, phone: trimmedPhone });
  }

  const hasContacts = useMemo(() => contacts.length > 0, [contacts]);

  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-4xl bg-white shadow-md rounded-xl p-6 border border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold mb-1">
              EduLife OS – Notification Contacts
            </h1>
            <p className="text-sm text-slate-600">
              Admin tool for contacts used by SMS utilities (debug, consent, alerts).
            </p>
          </div>

          <button
            type="button"
            onClick={fetchContacts}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm"
          >
            Refresh
          </button>
        </div>

        {loading && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Loading contacts…
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            <div className="font-semibold mb-1">Error</div>
            <pre className="whitespace-pre-wrap text-xs">{error}</pre>
          </div>
        )}

        {!loading && !hasContacts ? (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            No contacts loaded. If the DB is online, check your seed or table.
          </div>
        ) : null}

        {!loading && hasContacts ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Phone</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Active</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Created At</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-700">{c.id}</td>
                    <td className="px-3 py-2 text-slate-800">{c.name}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <code>{c.phone}</code>
                    </td>
                    <td className="px-3 py-2">
                      {c.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{c.createdAtDisplay}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-2">
                        <button
                          disabled={savingId === c.id}
                          onClick={() => handleToggleActive(c)}
                          className="px-2 py-1 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-60"
                        >
                          {c.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          disabled={savingId === c.id}
                          onClick={() => handleEdit(c)}
                          className="px-2 py-1 rounded-md border border-sky-500 text-sky-700 bg-sky-50 hover:bg-sky-100 disabled:opacity-60"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}

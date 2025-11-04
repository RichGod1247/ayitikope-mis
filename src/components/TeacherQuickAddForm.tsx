"use client";

import { useState } from "react";

export default function TeacherQuickAddForm() {
  const [first_name, setFirst] = useState("");
  const [last_name, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhats] = useState("");
  const [staffId, setStaff] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!first_name.trim() || !last_name.trim()) {
      setMsg("Please provide first and last name.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/admin/teachers/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          first_name,
          last_name,
          phone,
          email,
          whatsapp_number: whatsapp,
          staff_id: staffId,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setMsg(`❌ Error: ${j.error || r.statusText}`);
      } else {
        setMsg("✅ Teacher added.");
        setFirst(""); setLast(""); setPhone(""); setEmail(""); setWhats(""); setStaff("");
        setTimeout(() => window.location.reload(), 500);
      }
    } catch (err: any) {
      setMsg(`❌ Network error: ${String(err?.message || err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input
        className="rounded-md border px-3 py-2 outline-none focus:border-blue-600"
        placeholder="First name *"
        value={first_name}
        onChange={(e) => setFirst(e.target.value)}
      />
      <input
        className="rounded-md border px-3 py-2 outline-none focus:border-blue-600"
        placeholder="Last name *"
        value={last_name}
        onChange={(e) => setLast(e.target.value)}
      />
      <input
        className="rounded-md border px-3 py-2 outline-none focus:border-blue-600"
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="rounded-md border px-3 py-2 outline-none focus:border-blue-600"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="rounded-md border px-3 py-2 outline-none focus:border-blue-600"
        placeholder="WhatsApp number"
        value={whatsapp}
        onChange={(e) => setWhats(e.target.value)}
      />
      <input
        className="rounded-md border px-3 py-2 outline-none focus:border-blue-600"
        placeholder="Staff ID"
        value={staffId}
        onChange={(e) => setStaff(e.target.value)}
      />

      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? "Saving..." : "Add Teacher"}
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </form>
  );
}

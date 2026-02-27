// src/app/auth/invite-code/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function clean(v: string) {
  return (v ?? "").trim();
}

export default function InviteCodeEntryPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const initialCode = useMemo(() => clean(sp.get("code") || ""), [sp]);
  const redirectTo = useMemo(() => clean(sp.get("redirectTo") || sp.get("callbackUrl") || "/app"), [sp]);

  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    // If code is already provided, bounce straight to canonical signup.
    if (initialCode) {
      router.replace(
        `/auth/signup?code=${encodeURIComponent(initialCode)}&redirectTo=${encodeURIComponent(redirectTo)}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go() {
    const c = clean(code);
    if (!c) return;
    router.push(`/auth/signup?code=${encodeURIComponent(c)}&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Enter Onboarding Code</h1>
          <p className="text-sm text-zinc-600 mt-1">
            This will take you to the canonical signup page to capture your Staff ID and teaching scope.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Code</label>
          <input
            className="w-full border rounded-xl p-2 h-10"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="TC-ABCD-EFGH-IJKL"
            autoComplete="one-time-code"
          />
        </div>

        <button
          onClick={go}
          className="h-10 px-4 rounded-xl bg-black text-white border border-black hover:bg-zinc-800"
        >
          Continue
        </button>

        <div className="text-xs text-zinc-500">
          Canonical signup: <span className="font-mono">/auth/signup</span>
        </div>
      </div>
    </div>
  );
}

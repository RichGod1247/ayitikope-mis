"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton({
  className = "rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50",
}: {
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => signOut({ callbackUrl: "/auth/signin" })}
    >
      Logout
    </button>
  );
}

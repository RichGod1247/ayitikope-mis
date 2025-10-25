"use client";

import { useState } from "react";
import FormLogo from "@/components/FormLogo";

export default function TeacherPortalPage() {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    alert("Teacher login submitted (demo).");
  }

  return (
    <main className="container mx-auto px-6 py-10 max-w-xl">
      <FormLogo subtitle="Teacher Portal" />
      <h1 className="text-3xl font-bold mb-6 text-blue-900">Teacher Portal</h1>

      <form onSubmit={onSubmit} className="space-y-4 bg-white rounded-xl p-6 shadow">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded-md px-3 py-2"
            type="email"
            placeholder="teacher@example.com"
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="border rounded-md px-3 py-2"
            type="password"
            placeholder="****"
            required
          />
        </label>

        <button
          type="submit"
          className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2 rounded-md"
        >
          Sign In
        </button>
      </form>
    </main>
  );
}

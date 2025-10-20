"use client";

import { useState } from "react";

type Role = "parent" | "teacher";

export default function SignInForm({ role }: { role: Role }) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [contact, setContact] = useState(""); // email or phone
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");

  const roleLabel = role === "parent" ? "Parent" : "Teacher";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (tab === "signin") {
      if (!contact.trim() || !password.trim()) {
        alert("Please enter your email/phone and password.");
        return;
      }
      alert(`${roleLabel} sign in (demo):\nContact: ${contact}`);
      // TODO: replace with real auth later
    } else {
      if (!name.trim() || !contact.trim() || !password.trim() || !repeat.trim()) {
        alert("Please fill all fields.");
        return;
      }
      if (password !== repeat) {
        alert("Passwords do not match.");
        return;
      }
      alert(`${roleLabel} sign up (demo):\nName: ${name}\nContact: ${contact}`);
      // TODO: replace with real registration later
    }
  }

  return (
    <div className="max-w-xl w-full rounded-xl border bg-white p-6 shadow-sm">
      {/* Tabs */}
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab("signin")}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            tab === "signin" ? "bg-white shadow" : "text-gray-600"
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setTab("signup")}
          className={`ml-1 px-4 py-2 rounded-md text-sm font-medium ${
            tab === "signup" ? "bg-white shadow" : "text-gray-600"
          }`}
        >
          Create Account
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="grid gap-4">
        {tab === "signup" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email or Phone (WhatsApp)
          </label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="e.g. you@example.com or 0245444861"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>

        {tab === "signup" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Repeat Password
            </label>
            <input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </div>
        )}

        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-800"
        >
          {tab === "signin" ? "Sign In" : "Create Account"}
        </button>

        <p className="text-xs text-gray-500">
          Demo only — no real accounts yet. We’ll connect this to the MIS later.
        </p>
      </form>
    </div>
  );
}

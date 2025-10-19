"use client";

import { useState } from "react";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [message, setMessage] = useState("");

  const schoolEmail = "ayitikopebasic@gmail.com"; // TODO: put your real email

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !fromEmail.trim() || !message.trim()) {
      alert("Please fill in your name, email, and message.");
      return;
    }
    const subject = encodeURIComponent(`Website enquiry from ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${fromEmail}\n\nMessage:\n${message}`
    );
    window.location.href = `mailto:${schoolEmail}?subject=${subject}&body=${body}`;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 grid gap-4 rounded-xl border bg-white p-6 shadow-sm max-w-xl"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700">Your name</label>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-[--color-brand-500]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Your email</label>
        <input
          type="email"
          className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-[--color-brand-500]"
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Message</label>
        <textarea
          rows={5}
          className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-[--color-brand-500]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
        />
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-lg bg-[--color-brand-600] px-5 py-2.5 font-semibold text-white transition hover:bg-[--color-brand-700]"
      >
        Send message
      </button>

      <p className="text-xs text-gray-500">
        This opens your email app with the message pre-filled (simple & safe).
      </p>
    </form>
  );
}

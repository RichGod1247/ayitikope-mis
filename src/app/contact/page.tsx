"use client";

import { FormEvent } from "react";

export default function ContactPage() {
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const message = (form.elements.namedItem("message") as HTMLTextAreaElement).value;

    const subject = encodeURIComponent("Enquiry from Website");
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.location.href = `mailto:hehrichgod@gmail.com?subject=${subject}&body=${body}`;
  }

  return (
    <main className="container mx-auto px-6 py-12">
      <h1 className="text-3xl sm:text-4xl font-bold mb-6">Contact Us</h1>

      <div className="grid sm:grid-cols-2 gap-8">
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium mb-1">Your Name</label>
            <input
              name="name"
              required
              className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              name="email"
              required
              className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea
              name="message"
              rows={5}
              required
              className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 transition"
          >
            Send Message
          </button>
        </form>

        <div className="rounded-xl border bg-white p-6 shadow-sm text-gray-700 space-y-2">
          <p><strong>Address:</strong> P.O. Box 40, Akatsi South</p>
          <p><strong>Email:</strong> hehrichgod@gmail.com</p>
          <p><strong>Hours:</strong> Mon–Fri, 8:00 AM – 3:00 PM</p>
        </div>
      </div>
    </main>
  );
}

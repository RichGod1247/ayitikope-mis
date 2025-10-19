import ContactForm from "./ContactForm";

export const metadata = { title: "Contact • Ayitikope M/A Basic School" };

export default function ContactPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Contact Us</h1>
      <p className="mt-2 text-gray-600 max-w-2xl">
        Questions, feedback, or admissions enquiries? Send us a message and we’ll get back to you.
      </p>

      <ContactForm />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold">Address</div>
          <div className="mt-1 text-gray-700">Ayitikope, Volta Region, Ghana</div>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold">Phone</div>
          <div className="mt-1 text-gray-700">+233 (245444861)</div>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold">Email</div>
          <div className="mt-1 text-gray-700">ayitikopebasic@gmail.com</div>
        </div>
      </div>
    </main>
  );
}

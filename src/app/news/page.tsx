import { NEWS } from "@/data/news";

export const metadata = { title: "News • Ayitikope M/A Basic School" };

export default function NewsPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold">News & Events</h1>
      <p className="mt-3 max-w-2xl text-gray-700">
        Updates from our classrooms, campus projects, and community engagement.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NEWS.map((n) => (
          <article key={n.id} className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="text-xs text-gray-500 mb-2">
              {new Date(n.date).toLocaleDateString()}
            </div>
            <h2 className="font-semibold">{n.title}</h2>
            <p className="mt-2 text-gray-700">{n.summary}</p>
            {n.href && (
              <a
                href={n.href}
                className="mt-3 inline-block text-[--color-brand-600] hover:text-[--color-brand-700]"
              >
                View details
              </a>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}

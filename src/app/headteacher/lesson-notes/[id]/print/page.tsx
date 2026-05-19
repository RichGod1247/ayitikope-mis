// src/app/headteacher/lesson-notes/[id]/print/page.tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function HeadteacherLessonNotePrintRedirect({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};

  const embed = clean(first(sp.embed));
  const viewer = clean(first(sp.viewer));

  const qs = new URLSearchParams();
  if (embed) qs.set("embed", embed);
  if (viewer) qs.set("viewer", viewer);

  const query = qs.toString();

  redirect(`/print/lesson-note/${encodeURIComponent(id)}${query ? `?${query}` : ""}`);
}
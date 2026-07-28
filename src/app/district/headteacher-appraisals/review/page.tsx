import HeadteacherDirectorReviewClient from "./HeadteacherDirectorReviewClient";

export const dynamic = "force-dynamic";

type ReviewPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function firstValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function HeadteacherDirectorReviewPage({
  searchParams,
}: ReviewPageProps) {
  const resolved = await Promise.resolve(searchParams ?? {});
  const cycleId = firstValue(resolved.cycleId).trim();

  return (
    <HeadteacherDirectorReviewClient
      initialCycleId={cycleId}
    />
  );
}

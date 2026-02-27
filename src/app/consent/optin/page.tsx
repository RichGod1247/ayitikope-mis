import GuardianOptInClient from "./GuardianOptInClient";

type SP = {
  tenantId?: string | string[];
  studentId?: string | string[];
};

function pickOne(v: SP[keyof SP]): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default function GuardianOptInPage({
  searchParams,
}: {
  searchParams?: SP;
}) {
  const tenantId = pickOne(searchParams?.tenantId);
  const studentId = pickOne(searchParams?.studentId);

  return <GuardianOptInClient tenantId={tenantId} studentId={studentId} />;
}

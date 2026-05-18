// src/app/governance/invite/[token]/page.tsx
import GovernanceInviteAcceptClient from "./GovernanceInviteAcceptClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GovernanceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <GovernanceInviteAcceptClient token={token} />;
}
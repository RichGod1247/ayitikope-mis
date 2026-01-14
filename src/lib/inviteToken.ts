// src/lib/inviteToken.ts
function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

// Accept raw token/code OR full URL and extract common params
export function extractInviteToken(input: unknown): string {
  const v = cleanStr(input);
  if (!v) return "";

  try {
    const u = new URL(v);
    const token =
      u.searchParams.get("invite") ||
      u.searchParams.get("token") ||
      u.searchParams.get("inviteToken") ||
      "";
    return cleanStr(token) || v;
  } catch {
    return v;
  }
}

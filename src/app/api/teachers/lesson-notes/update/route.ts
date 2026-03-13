// src/app/api/teachers/lesson-notes/update/route.ts
import { POST as upstreamPOST } from "../upsert/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(...args: Parameters<typeof upstreamPOST>) {
  return upstreamPOST(...args);
}
// src/app/api/teachers/lesson-notes/from-scheme-item/route.ts
import { POST as upstreamPOST } from "@/app/api/teachers/lesson-notes/create-from-scheme/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(...args: Parameters<typeof upstreamPOST>) {
  return upstreamPOST(...args);
}
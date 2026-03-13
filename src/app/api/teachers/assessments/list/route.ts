// src/app/api/teachers/assessments/list/route.ts
import { GET as upstreamGET } from "@/app/api/teacher/assessment/items/list/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(...args: Parameters<typeof upstreamGET>) {
  return upstreamGET(...args);
}
// src/app/api/teachers/assessments/remark-summary/route.ts
import { GET as upstreamGET } from "@/app/api/teacher/assessment/remark-summary/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(...args: Parameters<typeof upstreamGET>) {
  return upstreamGET(...args);
}
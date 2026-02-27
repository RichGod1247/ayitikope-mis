// src/app/api/teachers/lesson-notes/update/route.ts
// Alias endpoint to keep UI expectations stable.
// It forwards update → upsert, so both routes behave identically.

export { POST } from "../upsert/route";

// Optional: if your upsert route exports runtime/dynamic, mirror it here to avoid surprises.
// If you don't use these in upsert, you can delete these two lines safely.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

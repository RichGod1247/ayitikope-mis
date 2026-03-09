export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deprecated route kept only for backward compatibility.
// Canonical implementation is bulk-upsert.
export { POST } from "../bulk-upsert/route";
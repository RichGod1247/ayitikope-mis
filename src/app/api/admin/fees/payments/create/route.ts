// src/app/api/admin/fees/payments/create/route.ts
// Compatibility wrapper.
//
// Canonical money-writing logic lives in:
// src/app/api/admin/fees/payments/add/route.ts
//
// This file keeps the old endpoint alive without duplicating finance logic.

import { POST as addPaymentPost } from "../add/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = addPaymentPost;
import { NextResponse } from "next/server";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { error: "Pool claim flow is disabled. Use assignments confirm or scan-claim." },
    { status: 410 },
  );
}

import { NextResponse } from "next/server";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const { data: zones, error } = await supabaseAdmin
    .from("delivery_zones")
    .select("id, name, code, polygon, active, priority, meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("active", true)
    .order("priority", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, zones: zones || [] });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const zoneId = body?.zoneId?.toString() || null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required numbers" }, { status: 400 });
  }

  if (zoneId) {
    const { data: zone, error: zoneError } = await supabaseAdmin
      .from("delivery_zones")
      .select("id")
      .eq("id", zoneId)
      .eq("warehouse_id", auth.profile.warehouse_id)
      .eq("active", true)
      .maybeSingle();
    if (zoneError) {
      return NextResponse.json({ error: zoneError.message }, { status: 500 });
    }
    if (!zone) {
      return NextResponse.json({ error: "zoneId is invalid for this warehouse" }, { status: 400 });
    }
  }

  const { data: shift } = await supabaseAdmin
    .from("courier_shifts")
    .select("id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const recordedAt = body?.recordedAt?.toString() || new Date().toISOString();
  const { error } = await supabaseAdmin.from("courier_locations").insert({
    warehouse_id: auth.profile.warehouse_id,
    courier_user_id: auth.user.id,
    shift_id: shift?.id ?? null,
    zone_id: zoneId,
    lat,
    lng,
    accuracy_m: body?.accuracy ?? null,
    speed_m_s: body?.speed ?? null,
    heading_deg: body?.heading ?? null,
    battery_level: body?.batteryLevel ?? null,
    source: "mobile",
    recorded_at: recordedAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    shift_id: shift?.id ?? null,
    recorded_at: recordedAt,
  });
}

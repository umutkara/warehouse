import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import {
  isAllowedOpsPointColorTransition,
  normalizeDropColorKey,
  resolveDropColor,
} from "@/lib/courier/drop-color";

const ALLOWED_ROLES = ["ops", "logistics", "admin", "head", "manager"] as const;

function extractOpsStatus(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  return typeof record.ops_status === "string" && record.ops_status.trim()
    ? record.ops_status.trim()
    : null;
}

export async function PATCH(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }
  if (!hasAnyRole(profile.role, [...ALLOWED_ROLES])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const unitId =
    typeof body?.unitId === "string" && body.unitId.trim() ? body.unitId.trim() : null;
  const nextColor = normalizeDropColorKey(body?.colorKey);
  const scenario =
    typeof body?.scenario === "string" && body.scenario.trim()
      ? body.scenario.trim().slice(0, 500)
      : null;
  if (!unitId || !nextColor) {
    return NextResponse.json({ error: "unitId and colorKey are required" }, { status: 400 });
  }

  const { data: unit, error: unitError } = await supabaseAdmin
    .from("units")
    .select("id, barcode, meta")
    .eq("id", unitId)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();
  if (unitError) return NextResponse.json({ error: unitError.message }, { status: 500 });
  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  const unitMeta = unit.meta && typeof unit.meta === "object" ? (unit.meta as Record<string, unknown>) : {};
  const current = resolveDropColor({
    opsStatus: extractOpsStatus(unitMeta),
    overrideColorKey: unitMeta.drop_point_color_override,
  });
  if (!isAllowedOpsPointColorTransition(current.color_key, nextColor)) {
    return NextResponse.json(
      { error: "Only yellow → red/green/blue transitions are allowed", current: current.color_key },
      { status: 400 },
    );
  }

  const updatedMeta: Record<string, unknown> = {
    ...unitMeta,
    drop_point_color_override: nextColor,
    drop_point_color_updated_at: new Date().toISOString(),
    drop_point_color_updated_by: userData.user.id,
    drop_point_color_source: "api.ops.courier-returns.color",
  };
  if (scenario !== null) {
    updatedMeta.ops_scenario = scenario;
  }
  const { error: updateError } = await supabaseAdmin
    .from("units")
    .update({ meta: updatedMeta })
    .eq("id", unit.id)
    .eq("warehouse_id", profile.warehouse_id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    unit_id: unit.id,
    color_key: nextColor,
    color_hex: resolveDropColor({ opsStatus: extractOpsStatus(updatedMeta), overrideColorKey: nextColor }).color_hex,
    scenario: scenario ?? undefined,
  });
}

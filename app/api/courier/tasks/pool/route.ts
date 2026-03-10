import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";
import { hasAnyRole } from "@/app/api/_shared/role-access";

export async function GET(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const zoneId = url.searchParams.get("zoneId");
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);
  const fetchLimit = Math.min(limit * 5, 500);

  let query = supabaseAdmin
    .from("courier_task_pool")
    .select(
      `
        id,
        unit_id,
        zone_id,
        priority,
        status,
        available_from,
        expires_at,
        meta
      `,
    )
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("status", "available")
    .order("priority", { ascending: false })
    .order("available_from", { ascending: true })
    .limit(fetchLimit);

  if (zoneId) query = query.eq("zone_id", zoneId);

  const { data: pool, error: poolError } = await query;
  if (poolError) {
    return NextResponse.json({ error: poolError.message }, { status: 500 });
  }

  const unitIds = (pool || []).map((row) => row.unit_id).filter(Boolean);
  let unitsMap = new Map<string, any>();
  if (unitIds.length) {
    const { data: units } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, meta, product_name, partner_name")
      .in("id", unitIds);
    unitsMap = new Map((units || []).map((unit) => [unit.id, unit]));
  }

  const isAdmin = hasAnyRole(auth.profile.role, ["admin"]);
  const visiblePool = (pool || []).filter((item) => {
    if (isAdmin) return true;
    const assignedCourierId = item?.meta?.assigned_courier_user_id;
    return !assignedCourierId || assignedCourierId === auth.user.id;
  });

  return NextResponse.json({
    ok: true,
    pool: visiblePool.slice(0, limit).map((item) => ({
      ...item,
      unit: unitsMap.get(item.unit_id) || null,
    })),
  });
}

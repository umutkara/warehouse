import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  const { data: transfers, error: transfersError } = await supabaseAdmin
    .from("transfers")
    .select("id, unit_id, from_warehouse_id, to_warehouse_id, status, created_at, received_at, meta")
    .eq("to_warehouse_id", profile.warehouse_id)
    .eq("status", "in_transit")
    .order("created_at", { ascending: false });

  if (transfersError) {
    return NextResponse.json({ error: transfersError.message }, { status: 400 });
  }

  const unitIds = Array.from(new Set((transfers ?? []).map((t) => t.unit_id))).filter(Boolean);
  let unitsById: Record<string, any> = {};
  if (unitIds.length > 0) {
    const { data: units, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id, warehouse_id, meta")
      .in("id", unitIds);

    if (!unitsError && units) {
      unitsById = Object.fromEntries(units.map((u) => [u.id, u]));
    }
  }

  const enriched = (transfers ?? []).map((t) => ({
    ...t,
    unit: unitsById[t.unit_id] ?? null,
  }));

  return NextResponse.json({ transfers: enriched });
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeBarcode(value: any) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * POST /api/admin/units/delete
 * Удаляет unit из БД по штрихкоду. Только admin.
 * Сначала удаляет связанные записи (picking_task_units, unit_moves, outbound_shipments), затем unit.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profError } = await supabase
      .from("profiles")
      .select("warehouse_id, role")
      .eq("id", userData.user.id)
      .single();

    if (profError || !profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const unitBarcode = normalizeBarcode(body?.barcode);

    if (!unitBarcode) {
      return NextResponse.json({ error: "barcode is required" }, { status: 400 });
    }

    const { data: unit, error: unitError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("barcode", unitBarcode)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const unitId = unit.id;

    // Удалить/обновить связанные записи (порядок важен из-за FK)
    await supabaseAdmin.from("picking_task_units").delete().eq("unit_id", unitId);
    await supabaseAdmin.from("unit_moves").delete().eq("unit_id", unitId);
    await supabaseAdmin.from("outbound_shipments").delete().eq("unit_id", unitId);
    // Legacy: в picking_tasks есть поле unit_id — обнуляем, чтобы не было orphan FK
    await supabaseAdmin.from("picking_tasks").update({ unit_id: null }).eq("unit_id", unitId);
    // Товары заказа (unit_items)
    await supabaseAdmin.from("unit_items").delete().eq("unit_id", unitId);

    const { error: deleteError } = await supabaseAdmin
      .from("units")
      .delete()
      .eq("id", unitId)
      .eq("warehouse_id", profile.warehouse_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    await supabase.rpc("audit_log_event", {
      p_action: "unit.delete",
      p_entity_type: "unit",
      p_entity_id: unitId,
      p_summary: `Удалён заказ из БД: ${unit.barcode}`,
      p_meta: {
        barcode: unit.barcode,
        source: "admin.panel",
      },
    });

    return NextResponse.json({ ok: true, barcode: unit.barcode });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const barcode = body?.barcode?.toString().trim();
  const note = body?.note?.toString() || null;
  if (!barcode) {
    return NextResponse.json({ error: "barcode is required" }, { status: 400 });
  }

  const { data: foundUnit, error: unitError } = await supabaseAdmin
    .from("units")
    .select("id, barcode, status")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("barcode", barcode)
    .maybeSingle();

  if (unitError) {
    return NextResponse.json({ error: unitError.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  let unit = foundUnit;
  if (!unit) {
    const { data: createdUnit, error: createUnitError } = await supabaseAdmin
      .from("units")
      .insert({
        warehouse_id: auth.profile.warehouse_id,
        barcode,
        status: "out",
        created_by: auth.user.id,
        meta: {
          source: "api.courier.tasks.scan_claim",
          external_pickup: true,
          external_pickup_created_at: now,
          external_pickup_created_by: auth.user.id,
          note,
        },
      })
      .select("id, barcode, status")
      .single();
    if (createUnitError || !createdUnit) {
      return NextResponse.json(
        { error: createUnitError?.message || "Failed to create external unit" },
        { status: 500 },
      );
    }
    unit = createdUnit;

    await supabaseAdmin.rpc("audit_log_event", {
      p_action: "unit.create.external_pickup",
      p_entity_type: "unit",
      p_entity_id: createdUnit.id,
      p_summary: `Создан внешний заказ по скану курьера ${barcode}`,
      p_meta: {
        source: "api.courier.tasks.scan_claim",
        external_pickup: true,
        created_by: auth.user.id,
        note,
      },
    });
  }

  const { data: activeShipment } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("unit_id", unit.id)
    .eq("status", "out")
    .order("out_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activeShipment) {
    await supabaseAdmin.from("outbound_shipments").insert({
      warehouse_id: auth.profile.warehouse_id,
      unit_id: unit.id,
      courier_name: auth.profile.full_name || auth.user.id,
      courier_user_id: auth.user.id,
      out_by: auth.user.id,
      out_at: now,
      status: "out",
      meta: {
        source: "api.courier.tasks.scan_claim",
        external_pickup: true,
        note,
      },
    });
  }

  const { data: existingTask, error: existingTaskError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, courier_user_id, status")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("unit_id", unit.id)
    .not("status", "in", "(delivered,failed,returned,canceled)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingTaskError) {
    return NextResponse.json({ error: existingTaskError.message }, { status: 500 });
  }

  if (existingTask && existingTask.courier_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Task is already assigned to another courier" }, { status: 409 });
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

  let taskId = existingTask?.id || null;
  if (existingTask) {
    const { error: updateError } = await supabaseAdmin
      .from("courier_tasks")
      .update({
        shift_id: shift?.id ?? null,
        courier_user_id: auth.user.id,
        status: "claimed",
        claimed_at: now,
        last_event_at: now,
        updated_at: now,
        meta: {
          source: "api.courier.tasks.scan_claim",
          scanned_barcode: barcode,
          note,
        },
      })
      .eq("id", existingTask.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { data: insertedTask, error: insertError } = await supabaseAdmin
      .from("courier_tasks")
      .insert({
        warehouse_id: auth.profile.warehouse_id,
        pool_id: null,
        shift_id: shift?.id ?? null,
        unit_id: unit.id,
        courier_user_id: auth.user.id,
        zone_id: null,
        status: "claimed",
        claimed_at: now,
        last_event_at: now,
        meta: {
          source: "api.courier.tasks.scan_claim",
          scanned_barcode: barcode,
          note,
        },
      })
      .select("id")
      .single();
    if (insertError || !insertedTask) {
      return NextResponse.json({ error: insertError?.message || "Failed to create task" }, { status: 500 });
    }
    taskId = insertedTask.id;
  }

  await supabaseAdmin
    .from("courier_task_events")
    .insert({
      warehouse_id: auth.profile.warehouse_id,
      task_id: taskId,
      unit_id: unit.id,
      courier_user_id: auth.user.id,
      shift_id: shift?.id ?? null,
      event_id: `scan-claim-${taskId}-${Date.now()}`,
      event_type: "claimed",
      happened_at: now,
      note: note || `Scanned barcode ${barcode}`,
      meta: { source: "api.courier.tasks.scan_claim" },
    });

  return NextResponse.json({
    ok: true,
    task_id: taskId,
    barcode: unit.barcode,
    unit_created: !foundUnit,
  });
}

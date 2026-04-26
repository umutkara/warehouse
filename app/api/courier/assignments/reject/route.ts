import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, {
    allowedRoles: [...COURIER_ALLOWED_ROLES],
  });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const shipmentIds = Array.isArray(body?.shipmentIds)
    ? body.shipmentIds.map((id: unknown) => id?.toString()).filter(Boolean)
    : [];
  const note = body?.note?.toString().trim();
  if (shipmentIds.length === 0) {
    return NextResponse.json(
      { error: "shipmentIds are required" },
      { status: 400 },
    );
  }
  if (!note) {
    return NextResponse.json(
      { error: "note is required for reject" },
      { status: 400 },
    );
  }

  const { data: shipments, error: shipmentsError } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id, unit_id, status, courier_user_id, meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .in("id", shipmentIds);

  if (shipmentsError) {
    return NextResponse.json(
      { error: shipmentsError.message },
      { status: 500 },
    );
  }

  const eligible = (shipments || []).filter(
    (shipment) =>
      shipment.status === "out" && shipment.courier_user_id === auth.user.id,
  );
  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "No eligible shipments found" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const rejectedIds: string[] = [];
  for (const shipment of eligible) {
    const existingMeta =
      shipment.meta && typeof shipment.meta === "object"
        ? (shipment.meta as Record<string, any>)
        : {};
    const mergedMeta = {
      ...existingMeta,
      courier_pickup_status: "rejected",
      courier_pickup_rejected_at: now,
      courier_pickup_rejected_by: auth.user.id,
      courier_pickup_reject_note: note,
      courier_pickup_confirmed_at: null,
      courier_pickup_confirmed_by: null,
      courier_pickup_note: null,
    };

    const { error: updateError } = await supabaseAdmin
      .from("outbound_shipments")
      .update({
        meta: mergedMeta,
        updated_at: now,
      })
      .eq("id", shipment.id)
      .eq("warehouse_id", auth.profile.warehouse_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: courierTasks, error: taskFetchError } = await supabaseAdmin
      .from("courier_tasks")
      .select("id, meta")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .eq("courier_user_id", auth.user.id)
      .eq("unit_id", shipment.unit_id)
      .not("status", "in", "(delivered,failed,returned,canceled)");
    if (taskFetchError) {
      return NextResponse.json(
        { error: taskFetchError.message },
        { status: 500 },
      );
    }
    for (const task of courierTasks || []) {
      const taskMeta =
        task.meta && typeof task.meta === "object"
          ? (task.meta as Record<string, unknown>)
          : {};
      const { error: taskUpdateError } = await supabaseAdmin
        .from("courier_tasks")
        .update({
          meta: {
            ...taskMeta,
            hidden_from_courier: true,
            hidden_from_courier_at: now,
            hidden_from_courier_by: auth.user.id,
            hidden_from_courier_reason: note,
            pickup_rejected: true,
          },
          updated_at: now,
        })
        .eq("id", task.id)
        .eq("warehouse_id", auth.profile.warehouse_id);
      if (taskUpdateError) {
        return NextResponse.json(
          { error: taskUpdateError.message },
          { status: 500 },
        );
      }
    }

    rejectedIds.push(shipment.id);

    const { data: unitRow } = await supabaseAdmin
      .from("units")
      .select("barcode")
      .eq("id", shipment.unit_id)
      .eq("warehouse_id", auth.profile.warehouse_id)
      .single();

    const { error: auditError } = await supabaseAdmin.rpc("audit_log_event", {
      p_action: "courier.pickup_rejected",
      p_entity_type: "unit",
      p_entity_id: shipment.unit_id,
      p_summary: `Курьер отказался от забора: ${unitRow?.barcode || shipment.unit_id}. Причина: ${note}`,
      p_meta: {
        source: "api.courier.assignments.reject",
        courier_user_id: auth.user.id,
        courier_name: auth.profile.full_name || auth.user.id,
        shipment_id: shipment.id,
        unit_barcode: unitRow?.barcode,
        reject_note: note,
      },
    });
    if (auditError) console.error(auditError.message);
  }

  return NextResponse.json({ ok: true, rejected: rejectedIds });
}

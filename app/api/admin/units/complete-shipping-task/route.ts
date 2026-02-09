import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeBarcode(value: any) {
  return String(value ?? "").replace(/\D/g, "");
}

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
    const note = String(body?.note || "").trim() || "admin complete shipping task";

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

    const { data: taskUnitRows, error: taskUnitError } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id")
      .eq("unit_id", unit.id);

    const { data: legacyTasks, error: legacyError } = await supabaseAdmin
      .from("picking_tasks")
      .select("id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("unit_id", unit.id);

    const taskIds = new Set<string>();
    (taskUnitRows || []).forEach((row: { picking_task_id: string }) => {
      if (row?.picking_task_id) taskIds.add(row.picking_task_id);
    });
    (legacyTasks || []).forEach((row: { id: string }) => {
      if (row?.id) taskIds.add(row.id);
    });

    if (taskIds.size === 0) {
      return NextResponse.json({ ok: true, updated: 0, warning: "No tasks for unit" });
    }

    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, status")
      .eq("warehouse_id", profile.warehouse_id)
      .in("id", Array.from(taskIds))
      .in("status", ["open", "in_progress"]);

    const targetTaskIds = (tasks || []).map((t: { id: string }) => t.id).filter(Boolean);

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }

    if (targetTaskIds.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, warning: "No open tasks for unit" });
    }

    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("picking_tasks")
      .update({
        status: "done",
        completed_by: userData.user.id,
        completed_at: completedAt,
      })
      .in("id", targetTaskIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await Promise.all(
      targetTaskIds.map((taskId) =>
        supabaseAdmin.rpc("audit_log_event", {
          p_action: "picking_task_complete",
          p_entity_type: "picking_task",
          p_entity_id: taskId,
          p_summary: `Завершена задача отгрузки (manual): ${unit.barcode}`,
          p_meta: {
            task_id: taskId,
            unit_id: unit.id,
            unit_barcode: unit.barcode,
            note,
            source: "admin.manual",
          },
        })
      )
    );

    return NextResponse.json({ ok: true, updated: targetTaskIds.length, taskIds: targetTaskIds });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

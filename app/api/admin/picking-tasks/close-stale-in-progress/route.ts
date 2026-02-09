import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function toInt(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function chunkArray<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
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
    const olderThanDays = toInt(body?.olderThanDays, 2);
    const note = String(body?.note || "").trim() || "admin close stale in_progress";
    const includeOpen = Boolean(body?.includeOpen);
    const includePicking = Boolean(body?.includePicking);
    const includeNoUnit = Boolean(body?.includeNoUnit);
    const statuses = includeOpen ? ["in_progress", "open"] : ["in_progress"];
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    const tasks: { id: string; unit_id: string | null; created_at: string }[] = [];
    let tasksError: { message?: string } | null = null;
    const pageSize = 1000;
    let pageFrom = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from("picking_tasks")
        .select("id, unit_id, created_at")
        .eq("warehouse_id", profile.warehouse_id)
        .in("status", statuses)
        .lte("created_at", cutoff)
        .order("created_at", { ascending: true })
        .range(pageFrom, pageFrom + pageSize - 1);
      if (error) {
        tasksError = error;
        break;
      }
      if (data && data.length > 0) {
        (data as any[]).forEach((row) => tasks.push(row as any));
      }
      if (!data || data.length < pageSize) break;
      pageFrom += pageSize;
    }

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }

    const taskIds = (tasks || []).map((t: { id: string }) => t.id).filter(Boolean);
    const legacyUnitIds = (tasks || []).map((t: { unit_id: string | null }) => t.unit_id).filter(Boolean);

    if (taskIds.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, warning: "No stale in_progress tasks" });
    }

    const taskUnits: { picking_task_id: string; unit_id: string }[] = [];
    let taskUnitsError: { message?: string } | null = null;
    const chunks = chunkArray(taskIds, 200);
    for (const chunk of chunks) {
      const { data, error } = await supabaseAdmin
        .from("picking_task_units")
        .select("picking_task_id, unit_id")
        .in("picking_task_id", chunk);
      if (error) {
        taskUnitsError = error;
        break;
      }
      (data || []).forEach((row: any) => taskUnits.push(row));
    }

    if (taskUnitsError) {
      return NextResponse.json({ error: taskUnitsError.message || "Task units fetch failed" }, { status: 400 });
    }

    const taskToUnitIds = new Map<string, Set<string>>();
    (taskUnits || []).forEach((row: { picking_task_id: string; unit_id: string }) => {
      if (!row?.picking_task_id || !row?.unit_id) return;
      if (!taskToUnitIds.has(row.picking_task_id)) {
        taskToUnitIds.set(row.picking_task_id, new Set());
      }
      taskToUnitIds.get(row.picking_task_id)?.add(row.unit_id);
    });

    (tasks || []).forEach((task: { id: string; unit_id: string | null }) => {
      if (task?.id && task.unit_id) {
        if (!taskToUnitIds.has(task.id)) {
          taskToUnitIds.set(task.id, new Set());
        }
        taskToUnitIds.get(task.id)?.add(task.unit_id);
      }
    });

    const allUnitIds = new Set<string>();
    taskToUnitIds.forEach((set) => set.forEach((id) => allUnitIds.add(id)));

    const tasksWithoutUnits: string[] = [];
    (tasks || []).forEach((task: { id: string }) => {
      if (task?.id && !taskToUnitIds.has(task.id)) {
        tasksWithoutUnits.push(task.id);
      }
    });

    if (allUnitIds.size === 0) {
      if (!includeNoUnit) {
        return NextResponse.json({ ok: true, updated: 0, warning: "No units for tasks" });
      }
    }

    const units: { id: string; cell_id: string | null }[] = [];
    let unitsError: { message?: string } | null = null;
    const unitIdChunks = chunkArray(Array.from(allUnitIds), 200);
    for (const chunk of unitIdChunks) {
      const { data, error } = await supabaseAdmin
        .from("units")
        .select("id, cell_id")
        .in("id", chunk);
      if (error) {
        unitsError = error;
        break;
      }
      (data || []).forEach((row: any) => units.push(row));
    }

    if (unitsError) {
      return NextResponse.json({ error: unitsError.message || "Units fetch failed" }, { status: 400 });
    }

    const unitToCellId = new Map<string, string | null>();
    (units || []).forEach((u: { id: string; cell_id: string | null }) => {
      if (u?.id) unitToCellId.set(u.id, u.cell_id ?? null);
    });

    const cellIds = Array.from(new Set((units || []).map((u: { cell_id: string | null }) => u.cell_id).filter(Boolean)));
    const { data: cells, error: cellsError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, cell_type")
      .in("id", cellIds);

    if (cellsError) {
      return NextResponse.json({ error: cellsError.message }, { status: 400 });
    }

    const cellTypeById = new Map<string, string>();
    (cells || []).forEach((c: { id: string; cell_type: string }) => {
      if (c?.id) cellTypeById.set(c.id, c.cell_type);
    });

    const taskIdsToClose: string[] = [];
    let hasPickingCount = 0;
    taskToUnitIds.forEach((unitIds, taskId) => {
      let hasPicking = false;
      unitIds.forEach((unitId) => {
        const cellId = unitToCellId.get(unitId) || null;
        const cellType = cellId ? cellTypeById.get(cellId) : null;
        if (cellType === "picking") {
          hasPicking = true;
        }
      });
      if (hasPicking) hasPickingCount += 1;
      if (!hasPicking || includePicking) taskIdsToClose.push(taskId);
    });

    if (includeNoUnit && tasksWithoutUnits.length > 0) {
      taskIdsToClose.push(...tasksWithoutUnits);
    }

    if (taskIdsToClose.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, warning: "All tasks have units in picking" });
    }

    const completedAt = new Date().toISOString();
    const updateChunks = chunkArray(taskIdsToClose, 200);
    let updateError: { message?: string } | null = null;
    const updatedTaskIds: string[] = [];
    for (const chunk of updateChunks) {
      const { error } = await supabaseAdmin
        .from("picking_tasks")
        .update({
          status: "done",
          completed_by: userData.user.id,
          completed_at: completedAt,
        })
        .in("id", chunk);
      if (error) {
        updateError = error;
        break;
      }
      updatedTaskIds.push(...chunk);
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message || "Update failed" }, { status: 400 });
    }

    await Promise.all(
      updatedTaskIds.map((taskId) =>
        supabaseAdmin.rpc("audit_log_event", {
          p_action: "picking_task_complete",
          p_entity_type: "picking_task",
          p_entity_id: taskId,
          p_summary: "Завершена задача отгрузки (manual bulk close)",
          p_meta: {
            task_id: taskId,
            note,
            source: "admin.manual.bulk",
          },
        })
      )
    );

    return NextResponse.json({ ok: true, updated: updatedTaskIds.length, taskIds: updatedTaskIds });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

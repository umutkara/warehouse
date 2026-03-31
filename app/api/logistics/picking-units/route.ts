import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/logistics/picking-units
 * Physical picking view for logistics: only units that are currently in picking cells (by units.cell_id).
 */
export async function GET() {
  const supabase = await supabaseServer();

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

  if (!hasAnyRole(profile.role, ["logistics", "admin", "head", "hub_worker"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: pickingCells, error: cellsError } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id, code, cell_type, meta, is_active")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("cell_type", "picking")
    .eq("is_active", true);
  if (cellsError) {
    return NextResponse.json({ error: cellsError.message }, { status: 400 });
  }
  const pickingCellRows = Array.isArray(pickingCells) ? pickingCells : [];
  const pickingCellIds = pickingCellRows.map((c: any) => c?.id).filter(Boolean);
  const cellById = new Map<string, any>(pickingCellRows.map((c: any) => [c.id, c]));

  let physicalUnits: any[] = [];
  if (pickingCellIds.length > 0) {
    const { data: rows, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id, created_at")
      .eq("warehouse_id", profile.warehouse_id)
      .in("cell_id", pickingCellIds)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }
    physicalUnits = (rows || []).map((u: any) => ({
      id: u.id,
      barcode: u.barcode ?? "",
      status: u.status ?? "",
      cell_id: u.cell_id ?? null,
      created_at: u.created_at,
      scenario: null,
      cell: u.cell_id ? (() => {
        const c = cellById.get(u.cell_id);
        return c ? { id: c.id, code: c.code, cell_type: c.cell_type, meta: c.meta ?? null } : null;
      })() : null,
    }));
  }

  // Enrich scenario from latest picking_task for these units (new and legacy schema),
  // with audit fallback when task.scenario is empty.
  const unitIds = physicalUnits.map((u: any) => u?.id).filter(Boolean);
  const scenarioByUnitId = new Map<string, string>();
  if (unitIds.length > 0) {
    // 1) New relation table: picking_task_units(unit_id, picking_task_id)
    let taskUnitLinks: { unit_id: string; picking_task_id: string }[] = [];
    const linkChunk = 200;
    for (let i = 0; i < unitIds.length; i += linkChunk) {
      const chunk = unitIds.slice(i, i + linkChunk);
      const { data: chunkRows, error: chunkErr } = await supabaseAdmin
        .from("picking_task_units")
        .select("unit_id, picking_task_id")
        .in("unit_id", chunk);
      if (chunkErr) {
        return NextResponse.json({ error: chunkErr.message }, { status: 400 });
      }
      if (chunkRows?.length) taskUnitLinks.push(...(chunkRows as any[]));
    }

    // 2) Legacy tasks: picking_tasks(unit_id, scenario, created_at)
    let legacyTasks: any[] = [];
    for (let i = 0; i < unitIds.length; i += linkChunk) {
      const chunk = unitIds.slice(i, i + linkChunk);
      const { data: chunkLegacy, error: legacyErr } = await supabaseAdmin
        .from("picking_tasks")
        .select("id, unit_id, scenario, created_at")
        .in("unit_id", chunk)
        .eq("warehouse_id", profile.warehouse_id);
      if (legacyErr) {
        return NextResponse.json({ error: legacyErr.message }, { status: 400 });
      }
      if (chunkLegacy?.length) legacyTasks.push(...chunkLegacy);
    }

    const taskIds = [
      ...new Set(taskUnitLinks.map((x: any) => x?.picking_task_id).filter(Boolean)),
    ];

    // 3) Load tasks referenced by picking_task_units
    let tasks: any[] = [];
    if (taskIds.length > 0) {
      const idChunk = 200;
      for (let i = 0; i < taskIds.length; i += idChunk) {
        const chunk = taskIds.slice(i, i + idChunk);
        const { data: chunkTasks, error: tasksErr } = await supabaseAdmin
          .from("picking_tasks")
          .select("id, scenario, created_at")
          .in("id", chunk)
          .eq("warehouse_id", profile.warehouse_id);
        if (tasksErr) {
          return NextResponse.json({ error: tasksErr.message }, { status: 400 });
        }
        if (chunkTasks?.length) tasks.push(...chunkTasks);
      }
    }

    const tasksMap = new Map<string, any>(tasks.map((t: any) => [t.id, t]));

    // 4) Audit fallback for tasks missing scenario
    const taskIdsWithoutScenario =
      tasks.length > 0 ? tasks.filter((t: any) => !t?.scenario?.trim()).map((t: any) => t.id) : taskIds;
    const auditScenarioByTaskId = new Map<string, string>();
    if (taskIdsWithoutScenario.length > 0) {
      const auditChunk = 100;
      let auditRows: any[] = [];
      for (let i = 0; i < taskIdsWithoutScenario.length; i += auditChunk) {
        const chunk = taskIdsWithoutScenario.slice(i, i + auditChunk);
        const auditByEntity = await supabaseAdmin
          .from("audit_events")
          .select("entity_id, meta")
          .eq("entity_type", "picking_task")
          .eq("action", "picking_task_create")
          .in("entity_id", chunk)
          .eq("warehouse_id", profile.warehouse_id)
          .order("created_at", { ascending: false });
        if (auditByEntity.data?.length) auditRows.push(...auditByEntity.data);
      }
      try {
        for (let i = 0; i < taskIdsWithoutScenario.length; i += auditChunk) {
          const chunk = taskIdsWithoutScenario.slice(i, i + auditChunk);
          const auditByRecord = await supabaseAdmin
            .from("audit_events")
            .select("record_id, meta")
            .eq("action", "picking_task_create")
            .in("record_id", chunk)
            .eq("warehouse_id", profile.warehouse_id)
            .order("created_at", { ascending: false })
            .limit(500);
          if (auditByRecord.data?.length) auditRows.push(...auditByRecord.data);
        }
      } catch (_) {
        // record_id column may not exist
      }
      auditRows.forEach((row: any) => {
        const tid = row.entity_id ?? row.record_id;
        const meta = row.meta ?? {};
        const scenarioFromMeta =
          typeof meta === "string"
            ? (() => {
                try {
                  return JSON.parse(meta)?.scenario;
                } catch {
                  return null;
                }
              })()
            : meta?.scenario;
        if (
          tid &&
          scenarioFromMeta &&
          typeof scenarioFromMeta === "string" &&
          scenarioFromMeta.trim() &&
          !auditScenarioByTaskId.has(tid)
        ) {
          auditScenarioByTaskId.set(tid, scenarioFromMeta.trim());
        }
      });
    }

    // 5) Latest task per unit from relations
    const latestTaskByUnitId = new Map<string, any>();
    taskUnitLinks.forEach((tu: any) => {
      if (!tu?.unit_id || !tu?.picking_task_id) return;
      const candidate = tasksMap.get(tu.picking_task_id);
      if (!candidate) return;
      const current = latestTaskByUnitId.get(tu.unit_id);
      if (!current) {
        latestTaskByUnitId.set(tu.unit_id, candidate);
        return;
      }
      const currentTs = new Date(current.created_at || 0).getTime();
      const candidateTs = new Date(candidate.created_at || 0).getTime();
      if (candidateTs >= currentTs) latestTaskByUnitId.set(tu.unit_id, candidate);
    });

    // 6) Latest legacy task per unit
    const latestLegacyTaskByUnitId = new Map<string, any>();
    legacyTasks.forEach((t: any) => {
      if (!t?.unit_id) return;
      const current = latestLegacyTaskByUnitId.get(t.unit_id);
      if (!current) {
        latestLegacyTaskByUnitId.set(t.unit_id, t);
        return;
      }
      const currentTs = new Date(current.created_at || 0).getTime();
      const candidateTs = new Date(t.created_at || 0).getTime();
      if (candidateTs >= currentTs) latestLegacyTaskByUnitId.set(t.unit_id, t);
    });

    // 7) Choose scenario
    unitIds.forEach((uid: string) => {
      const task = latestTaskByUnitId.get(uid) || null;
      const legacy = latestLegacyTaskByUnitId.get(uid) || null;
      const effectiveTaskId = task?.id || legacy?.id || null;
      const scenarioFromTask = task?.scenario?.trim() || legacy?.scenario?.trim() || null;
      const scenario = scenarioFromTask || (effectiveTaskId ? auditScenarioByTaskId.get(effectiveTaskId) || null : null);
      if (scenario) scenarioByUnitId.set(uid, scenario);
    });
  }

  physicalUnits = physicalUnits.map((u: any) => ({
    ...u,
    scenario: scenarioByUnitId.get(u.id) ?? null,
  }));

  return NextResponse.json({
    ok: true,
    units: physicalUnits,
  });
}

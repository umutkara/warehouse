import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildBarcodeCandidates, normalizeBarcodeDigits } from "@/lib/barcode/normalization";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const barcode = normalizeBarcodeDigits(url.searchParams.get("barcode") ?? "");

  if (!barcode) {
    return NextResponse.json({ error: "Не указан barcode" }, { status: 400 });
  }

  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();
  if (profErr || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  // Находим unit по штрихкоду и складу.
  const barcodeCandidates = buildBarcodeCandidates(barcode);
  const { data: exactUnit, error: exactErr } = await supabase
    .from("units")
    .select("id, barcode, cell_id, status, created_at")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("barcode", barcode)
    .maybeSingle();
  let unit = exactUnit;
  let uErr = exactErr;
  if (!unit && !uErr && barcodeCandidates.length > 1) {
    const { data: fallbackUnits, error: fallbackErr } = await supabase
      .from("units")
      .select("id, barcode, cell_id, status, created_at")
      .eq("warehouse_id", profile.warehouse_id)
      .in("barcode", barcodeCandidates)
      .order("created_at", { ascending: false })
      .limit(1);
    uErr = fallbackErr;
    unit = fallbackUnits?.[0] ?? null;
  }

  if (uErr || !unit) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  // "Фактическое местонахождение" = последняя точка перемещения unit_moves.to_cell_id (если есть).
  // Если лог перемещения отсутствует, используем units.cell_id, а если он пуст — active picking task target.
  let lastMoveToCellId: string | null = null;
  try {
    const { data: lastMove } = await supabaseAdmin
      .from("unit_moves")
      .select("to_cell_id, created_at")
      .eq("unit_id", unit.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastMoveToCellId = (lastMove?.to_cell_id as string) ?? null;
  } catch {
    lastMoveToCellId = null;
  }

  // Avoid mixing || with ?? (Turbopack parser strictness).
  let resolvedCellId: string | null = lastMoveToCellId || unit.cell_id || null;

  // Fallback: when physical cell is not set, try latest active picking task target cell.
  if (!resolvedCellId) {
    const { data: taskLinks, error: taskLinksErr } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id")
      .eq("unit_id", unit.id);

    if (!taskLinksErr && (taskLinks || []).length > 0) {
      const taskIds = [...new Set((taskLinks || []).map((row: any) => row.picking_task_id).filter(Boolean))];
      if (taskIds.length > 0) {
        const { data: tasks, error: tasksErr } = await supabaseAdmin
          .from("picking_tasks")
          .select("id, created_at, target_picking_cell_id")
          .eq("warehouse_id", profile.warehouse_id)
          .in("id", taskIds)
          .in("status", ["open", "in_progress"])
          .not("target_picking_cell_id", "is", null)
          .order("created_at", { ascending: false });
        if (!tasksErr && (tasks || []).length > 0) {
          resolvedCellId = tasks?.[0]?.target_picking_cell_id ?? null;
        }
      }
    }
  }

  if (!resolvedCellId) {
    return NextResponse.json({
      unit,
      cell: null,
      message: "Заказ найден, но ячейка не определена (ни физически, ни по active picking task)",
    });
  }

  const { data: cellById, error: cErr } = await supabase
    .from("warehouse_cells_map")
    .select("id, code, cell_type, x, y, w, h, meta, is_active, warehouse_id")
    .eq("id", resolvedCellId)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (cErr) {
    return NextResponse.json({
      unit,
      cell: null,
      message: "Ошибка загрузки ячейки",
    });
  }

  if (!cellById) {
    return NextResponse.json({
      unit,
      cell: null,
      message: "Ячейка не найдена (возможно удалена или недоступна в warehouse map)",
    });
  }

  return NextResponse.json({
    unit: {
      ...unit,
      cell_id: resolvedCellId,
    },
    cell: cellById,
  });
}
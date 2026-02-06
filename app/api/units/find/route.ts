import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const barcode = (url.searchParams.get("barcode") ?? "").trim();

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

  // Находим unit по штрихкоду и складу (в т.ч. status для отображения по факту при рассинхроне)
  const { data: unit, error: uErr } = await supabase
    .from("units")
    .select("id, barcode, cell_id, status, created_at")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("barcode", barcode)
    .maybeSingle();

  if (uErr || !unit) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  // Если не размещён
  if (!unit.cell_id) {
    return NextResponse.json({
      unit,
      cell: null,
      message: "Заказ найден, но не размещён (ячейка не назначена)",
    });
  }

  // Берём ячейку из warehouse_cells_map; при рассинхроне (status=rejected/ff, а cell_id на storage) — по статусу
  const { data: cellById, error: cErr } = await supabase
    .from("warehouse_cells_map")
    .select("id, code, cell_type, x, y, w, h, meta, is_active, warehouse_id")
    .eq("id", unit.cell_id)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (cErr) {
    return NextResponse.json({
      unit,
      cell: null,
      message: "Ошибка загрузки ячейки",
    });
  }

  const rawType = cellById?.cell_type;
  const useStatusCell =
    (unit.status === "rejected" && rawType !== "rejected") ||
    (unit.status === "ff" && rawType !== "ff");

  let cell = cellById;
  if (useStatusCell && unit.status) {
    const { data: statusCell } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type, x, y, w, h, meta, is_active, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("cell_type", unit.status === "rejected" ? "rejected" : "ff")
      .limit(1)
      .maybeSingle();
    if (statusCell) cell = statusCell;
  }

  if (!cell) {
    return NextResponse.json({
      unit,
      cell: null,
      message: "Ячейка не найдена (возможно удалена)",
    });
  }

  return NextResponse.json({ unit, cell });
}
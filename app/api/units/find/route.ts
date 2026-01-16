import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const barcode = (url.searchParams.get("barcode") ?? "").trim();

  if (!barcode) {
    return NextResponse.json({ error: "Не указан barcode" }, { status: 400 });
  }

  // Находим unit
  const { data: unit, error: uErr } = await supabase
    .from("units")
    .select("id, barcode, cell_id, created_at")
    .eq("barcode", barcode)
    .single();

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

  // Берём ячейку (из исходной таблицы, не из view — надёжнее)
  const { data: cell, error: cErr } = await supabase
    .from("warehouse_cells")
    .select("id, code, cell_type, x, y, w, h, meta, is_active, warehouse_id")
    .eq("id", unit.cell_id)
    .single();

  if (cErr || !cell) {
    return NextResponse.json({
      unit,
      cell: null,
      message: "Ячейка не найдена (возможно удалена)",
    });
  }

  return NextResponse.json({ unit, cell });
}
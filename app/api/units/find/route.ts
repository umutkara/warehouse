import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function buildBarcodeCandidates(rawBarcode: string): string[] {
  const barcode = rawBarcode.trim();
  const out = new Set<string>();
  if (!barcode) return [];
  out.add(barcode);

  const digitsOnly = /^\d+$/.test(barcode);
  if (!digitsOnly) return Array.from(out);

  if (barcode.startsWith("00") && barcode.length > 4) {
    out.add(barcode.slice(2, -2));
  }
  if (!barcode.startsWith("00")) {
    out.add(`00${barcode}`);
    out.add(`00${barcode}01`);
  } else {
    out.add(`${barcode}01`);
  }
  if (!barcode.endsWith("01")) {
    out.add(`${barcode}01`);
  }

  return Array.from(out).filter(Boolean);
}

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
    const { data: similarUnits } = await supabase
      .from("units")
      .select("barcode")
      .eq("warehouse_id", profile.warehouse_id)
      .ilike("barcode", `%${barcode}%`)
      .limit(5);
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

  // Источник истины для расположения: unit.cell_id.
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

  if (!cellById) {
    return NextResponse.json({
      unit,
      cell: null,
      message: "Ячейка не найдена (возможно удалена)",
    });
  }

  return NextResponse.json({ unit, cell: cellById });
}
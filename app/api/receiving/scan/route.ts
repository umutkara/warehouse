import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const allowed = new Set(["worker", "manager", "head", "admin"]);

function normalizeCellCode(v: any): string {
  // Убрать "CELL:" если есть, trim, upper
  let code = String(v ?? "").trim();
  if (code.toUpperCase().startsWith("CELL:")) {
    code = code.substring(5).trim();
  }
  return code.toUpperCase();
}

function normalizeUnitBarcode(v: any): string {
  // Только цифры, trim
  return String(v ?? "").replace(/\D/g, "").trim();
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
    }

    // Profile check
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, warehouse_id")
      .eq("id", user.id)
      .single();

    if (!profile?.role || !allowed.has(profile.role)) {
      return NextResponse.json({ error: "Forbidden", ok: false }, { status: 403 });
    }

    if (!profile.warehouse_id) {
      return NextResponse.json(
        { error: "Не найден warehouse_id у профиля", ok: false },
        { status: 400 }
      );
    }

    // Parse body
    const body = await req.json().catch(() => null);
    const cellCode = normalizeCellCode(body?.cellCode);
    const digits = normalizeUnitBarcode(body?.unitBarcode);

    // Validation
    if (!digits) {
      return NextResponse.json({ error: "unitBarcode is required", ok: false }, { status: 400 });
    }

    if (!cellCode) {
      return NextResponse.json({ error: "cellCode is required", ok: false }, { status: 400 });
    }

    // Load cell
    const { data: binCell, error: cellError } = await supabase
      .from("warehouse_cells")
      .select("id, code, cell_type, is_active, meta")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", cellCode)
      .single();

    if (cellError || !binCell) {
      return NextResponse.json({ error: "Ячейка не найдена", ok: false }, { status: 404 });
    }

    // Check cell_type === 'bin'
    if (binCell.cell_type !== "bin") {
      return NextResponse.json(
        { error: "Приемка разрешена только в BIN-ячейки", ok: false },
        { status: 400 }
      );
    }

    // Check is_active === true
    if (!binCell.is_active) {
      return NextResponse.json(
        { error: `Ячейка "${cellCode}" не активна`, ok: false },
        { status: 400 }
      );
    }

    // Check meta.blocked !== true
    if (binCell.meta?.blocked === true) {
      return NextResponse.json(
        { error: `Ячейка "${cellCode}" заблокирована`, ok: false },
        { status: 400 }
      );
    }

    // Check if unit exists
    const { data: existingUnit, error: unitCheckError } = await supabase
      .from("units")
      .select("id, barcode, cell_id, status")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("barcode", digits)
      .maybeSingle();

    if (unitCheckError && unitCheckError.code !== "PGRST116") {
      // PGRST116 = not found, это нормально
      console.error("Error checking unit:", unitCheckError);
      return NextResponse.json(
        { error: "Ошибка проверки unit", ok: false },
        { status: 500 }
      );
    }

    // SCENARIO B: unit найден и уже в этой BIN
    if (existingUnit && existingUnit.cell_id === binCell.id) {
      return NextResponse.json({
        ok: true,
        unitId: existingUnit.id,
        barcode: digits,
        cell: { id: binCell.id, code: binCell.code, cell_type: "bin" },
        status: existingUnit.status,
        message: "Уже в этой BIN",
      });
    }

    // SCENARIO C: unit найден и уже размещён в другой ячейке
    if (existingUnit && existingUnit.cell_id !== null && existingUnit.cell_id !== binCell.id) {
      return NextResponse.json(
        {
          error:
            "Unit уже размещен в другой ячейке. Для перемещения используйте режим Перемещение.",
          ok: false,
        },
        { status: 400 }
      );
    }

    let unitId: string;

    // SCENARIO A: unit НЕ найден - создаём новый
    if (!existingUnit) {
      // Создаём unit через прямую вставку (логика из /api/units/create)
      const { data: createdUnit, error: createError } = await supabase
        .from("units")
        .insert({
          barcode: digits,
          warehouse_id: profile.warehouse_id,
          status: "receiving",
        })
        .select("id, barcode, created_at, warehouse_id")
        .single();

      if (createError) {
        console.error("Database error creating unit:", createError);
        return NextResponse.json({ error: createError.message, ok: false }, { status: 400 });
      }

      // Audit logging for creation
      await supabase.from("unit_moves").insert({
        warehouse_id: createdUnit.warehouse_id,
        unit_id: createdUnit.id,
        from_cell_id: null,
        to_cell_id: null,
        moved_by: user.id,
        source: "receiving",
        note: "Создано в системе",
      });

      unitId = createdUnit.id;
    } else {
      // SCENARIO D: unit найден, но cell_id == null
      unitId = existingUnit.id;
    }

    // Размещаем unit в BIN через RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc("move_unit_to_cell", {
      p_unit_id: unitId,
      p_to_cell_id: binCell.id,
      p_to_status: "receiving",
    });

    if (rpcError) {
      console.error("move_unit_to_cell RPC error:", rpcError);
      return NextResponse.json(
        { error: rpcError.message || "Ошибка размещения в BIN", ok: false },
        { status: 500 }
      );
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;
    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.error || "Ошибка размещения в BIN", ok: false },
        { status: 400 }
      );
    }

    // Success response
    return NextResponse.json({
      ok: true,
      unitId,
      barcode: digits,
      cell: { id: binCell.id, code: binCell.code, cell_type: "bin" },
      status: "receiving",
      message: "Принято в BIN",
    });
  } catch (e: any) {
    console.error("Unexpected error in receiving/scan:", e);
    return NextResponse.json({ error: "Internal server error", ok: false }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import * as XLSX from "xlsx";

/**
 * GET /api/units/export-excel
 * Exports units to Excel-compatible CSV with optional history
 * Query params:
 * - age: all | 24h | 48h | 7d
 * - status: on_warehouse | bin | stored | picking | shipping | out | rejected | ff | all
 * - search: search by barcode
 * - ops: OPS статус or "all"
 * - cellType: all | bin | storage | picking | shipping | rejected | ff | ...
 * - scope: warehouse | all (all only for admin/head)
 * - includeHistory: 1 | 0
 * - createdFrom: YYYY-MM-DD (created_at lower bound)
 * - createdTo: YYYY-MM-DD (created_at upper bound)
 * - trimBarcodeSuffix01: 1 | 0
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id, role")
      .eq("id", userData.user.id)
      .single();

    // Parse query params
    const { searchParams } = new URL(req.url);
    const ageFilter = searchParams.get("age") || "all";
    const searchQuery = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status") || "on_warehouse";
    const opsFilter = searchParams.get("ops") || "all";
    const cellTypeFilter = searchParams.get("cellType") || "all";
    const scope = searchParams.get("scope") === "all" ? "all" : "warehouse";
    const includeHistory = searchParams.get("includeHistory") === "1";
    const createdFromRaw = (searchParams.get("createdFrom") || "").trim();
    const createdToRaw = (searchParams.get("createdTo") || "").trim();
    const trimBarcodeSuffix01 = searchParams.get("trimBarcodeSuffix01") === "1";
    const userRole = profile?.role ?? "guest";
    const canExportAll = ["admin", "head"].includes(userRole);
    const createdFromIso = createdFromRaw ? new Date(`${createdFromRaw}T00:00:00.000Z`) : null;
    const createdToIso = createdToRaw ? new Date(`${createdToRaw}T23:59:59.999Z`) : null;

    if (createdFromIso && Number.isNaN(createdFromIso.getTime())) {
      return NextResponse.json({ error: "Некорректная дата 'от'" }, { status: 400 });
    }

    if (createdToIso && Number.isNaN(createdToIso.getTime())) {
      return NextResponse.json({ error: "Некорректная дата 'до'" }, { status: 400 });
    }

    if (createdFromIso && createdToIso && createdFromIso.getTime() > createdToIso.getTime()) {
      return NextResponse.json({ error: "Дата 'от' не может быть позже даты 'до'" }, { status: 400 });
    }
    if (scope === "all" && !canExportAll) {
      return NextResponse.json({ error: "Недостаточно прав для выгрузки всех units" }, { status: 403 });
    }

    if (scope !== "all" && !profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Calculate date threshold
    let dateThreshold: string | null = null;
    const now = new Date();

    switch (ageFilter) {
      case "24h":
        dateThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        break;
      case "48h":
        dateThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
        break;
      case "7d":
        dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        dateThreshold = null;
    }

    const applyFilters = (query: any) => {
      let next = query;

      if (scope !== "all") {
        next = next.eq("warehouse_id", profile!.warehouse_id);
      }

      if (statusFilter && statusFilter !== "all") {
        if (statusFilter === "on_warehouse") {
          next = next.in("status", ["bin", "stored", "picking", "shipping", "rejected", "ff"]);
        } else {
          next = next.eq("status", statusFilter);
        }
      }

      if (searchQuery.trim()) {
        next = next.ilike("barcode", `%${searchQuery.trim()}%`);
      }

      if (dateThreshold) {
        next = next.lt("created_at", dateThreshold);
      }

      if (createdFromIso) {
        next = next.gte("created_at", createdFromIso.toISOString());
      }

      if (createdToIso) {
        next = next.lte("created_at", createdToIso.toISOString());
      }

      if (opsFilter && opsFilter !== "all") {
        if (opsFilter === "no_status") {
          next = (next as any).is("meta->>ops_status", null);
        } else {
          next = next.contains("meta", { ops_status: opsFilter });
        }
      }

      if (cellTypeFilter && cellTypeFilter !== "all") {
        next = next.eq("warehouse_cells.cell_type", cellTypeFilter);
      }

      return next;
    };

    const cellRelationSelect =
      cellTypeFilter && cellTypeFilter !== "all"
        ? "warehouse_cells!units_cell_id_fkey!inner(code, cell_type)"
        : "warehouse_cells!units_cell_id_fkey(code, cell_type)";

    // Fetch all units in pages to avoid PostgREST 1000-row default window.
    const units: any[] = [];
    const pageSize = 1000;
    let offset = 0;
    for (;;) {
      const pagedQuery = applyFilters(
        supabaseAdmin
          .from("units")
          .select(`
            id,
            barcode,
            status,
            product_name,
            partner_name,
            price,
            cell_id,
            created_at,
            meta,
            ${cellRelationSelect}
          `)
          .order("created_at", { ascending: false })
      ).range(offset, offset + pageSize - 1);

      const { data: pageUnits, error: pageError } = await pagedQuery;
      if (pageError) {
        console.error("Units export error:", pageError);
        return NextResponse.json({ error: "Failed to load units" }, { status: 500 });
      }

      const chunk = pageUnits || [];
      units.push(...chunk);
      if (chunk.length < pageSize) break;
      offset += pageSize;
    }

    // По факту: ячейку для отображения берём из warehouse_cells_map
    const cellIds = [...new Set((units || []).map((u: any) => u.cell_id).filter(Boolean))];
    const cellsMap = new Map<string, { code: string; cell_type: string }>();
    if (cellIds.length > 0) {
      let cellsQuery = supabaseAdmin
        .from("warehouse_cells_map")
        .select("id, code, cell_type")
        .in("id", cellIds);
      if (scope !== "all") {
        cellsQuery = cellsQuery.eq("warehouse_id", profile!.warehouse_id);
      }
      const { data: cells } = await cellsQuery;
      cells?.forEach((c: any) => cellsMap.set(c.id, { code: c.code, cell_type: c.cell_type }));
    }
    const unitIds = (units || []).map((u: any) => u.id);
    let lastActions: any[] = [];
    if (unitIds.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < unitIds.length; i += chunkSize) {
        const chunkIds = unitIds.slice(i, i + chunkSize);
        const { data: chunkLastActions, error: lastActionsError } = await supabaseAdmin
          .from("unit_moves")
          .select("unit_id, created_at, from_cell_id, to_cell_id, moved_by, note")
          .in("unit_id", chunkIds)
          .order("created_at", { ascending: false });
        if (lastActionsError) {
          console.error("Units export last action error:", lastActionsError);
          return NextResponse.json({ error: "Failed to load units last actions" }, { status: 500 });
        }
        lastActions = lastActions.concat(chunkLastActions || []);
      }
    }

    // Group last actions by unit_id
    const lastActionMap: Record<string, any> = {};
    (lastActions || []).forEach((action: any) => {
      if (!lastActionMap[action.unit_id]) {
        lastActionMap[action.unit_id] = action;
      }
    });

    const historyByUnit: Record<string, any[]> = {};
    let allHistoryMoves: any[] = [];
    if (includeHistory && unitIds.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < unitIds.length; i += chunkSize) {
        const chunkIds = unitIds.slice(i, i + chunkSize);
        const { data: chunkMoves, error: movesError } = await supabaseAdmin
          .from("unit_moves")
          .select("unit_id, created_at, from_cell_id, to_cell_id, moved_by, note")
          .in("unit_id", chunkIds)
          .order("created_at", { ascending: false });
        if (movesError) {
          console.error("Units history export error:", movesError);
          return NextResponse.json({ error: "Failed to load units history" }, { status: 500 });
        }
        allHistoryMoves = allHistoryMoves.concat(chunkMoves || []);
      }

      for (const move of allHistoryMoves) {
        if (!historyByUnit[move.unit_id]) historyByUnit[move.unit_id] = [];
        historyByUnit[move.unit_id].push(move);
      }

      const moveCellIds = [
        ...new Set(
          allHistoryMoves
            .flatMap((m: any) => [m.from_cell_id, m.to_cell_id])
            .filter((id: string | null) => Boolean(id) && !cellsMap.has(id as string))
        ),
      ] as string[];

      if (moveCellIds.length > 0) {
        let movesCellsQuery = supabaseAdmin
          .from("warehouse_cells_map")
          .select("id, code, cell_type")
          .in("id", moveCellIds);
        if (scope !== "all") {
          movesCellsQuery = movesCellsQuery.eq("warehouse_id", profile!.warehouse_id);
        }
        const { data: moveCells } = await movesCellsQuery;
        moveCells?.forEach((c: any) => cellsMap.set(c.id, { code: c.code, cell_type: c.cell_type }));
      }
    }

    const headers = [
      "Штрихкод",
      "Статус",
      "Товар",
      "Партнер",
      "Цена",
      "Ячейка",
      "Тип ячейки",
      "Создан",
      "На складе (часов)",
      "Последнее действие",
      "Дата действия",
    ];
    if (includeHistory) {
      headers.push("Количество изменений", "История изменений");
    }

    const rows = (units || []).map((unit: any) => {
      const createdAt = new Date(unit.created_at);
      const ageHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
      const lastAction = lastActionMap[unit.id];
      const rawBarcode = String(unit.barcode || "");
      let normalizedBarcode = rawBarcode;
      if (trimBarcodeSuffix01) {
        if (rawBarcode.startsWith("00") && rawBarcode.length > 4) {
          // For "00..." barcodes remove leading "00" and trailing 2 digits.
          normalizedBarcode = rawBarcode.slice(2, -2);
        } else if (/^3.*01$/.test(rawBarcode) && rawBarcode.length > 2) {
          // For "3...01" barcodes remove trailing "01".
          normalizedBarcode = rawBarcode.slice(0, -2);
        }
      }
      
      let lastActionText = "—";
      let lastActionDate = "—";
      
      if (lastAction) {
        lastActionDate = new Date(lastAction.created_at).toLocaleString("ru-RU");
        if (lastAction.note) {
          lastActionText = lastAction.note;
        } else {
          lastActionText = "Перемещение";
        }
      }

      const cell = unit.cell_id ? cellsMap.get(unit.cell_id) : null;
      const row: string[] = [
        normalizedBarcode,
        unit.status || "",
        unit.product_name || "",
        unit.partner_name || "",
        unit.price ? unit.price.toFixed(2) : "",
        cell?.code ?? unit.warehouse_cells?.code ?? "",
        cell?.cell_type ?? unit.warehouse_cells?.cell_type ?? "",
        createdAt.toLocaleString("ru-RU"),
        ageHours.toString(),
        lastActionText,
        lastActionDate,
      ];

      if (includeHistory) {
        const unitHistory = historyByUnit[unit.id] || [];
        const historyText =
          unitHistory.length > 0
            ? unitHistory
                .map((move: any) => {
                  const movedAt = new Date(move.created_at).toLocaleString("ru-RU");
                  const fromCode = move.from_cell_id
                    ? (cellsMap.get(move.from_cell_id)?.code ?? move.from_cell_id)
                    : "—";
                  const toCode = move.to_cell_id
                    ? (cellsMap.get(move.to_cell_id)?.code ?? move.to_cell_id)
                    : "—";
                  const notePart = move.note ? `; ${move.note}` : "";
                  return `${movedAt}: ${fromCode} -> ${toCode}${notePart}`;
                })
                .join("\n")
            : "—";

        row.push(unitHistory.length.toString(), historyText);
      }

      return row;
    });

    const worksheetData: (string | number)[][] = [headers, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet["!cols"] = headers.map(() => ({ wch: 20 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Заказы");
    const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    // Return as downloadable file
    const filenamePrefix = scope === "all" ? "units_all_system" : "units_on_warehouse";
    return new Response(xlsxBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenamePrefix}_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (e: any) {
    console.error("Export error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

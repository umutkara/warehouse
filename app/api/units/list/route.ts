import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildBarcodeCandidates, normalizeBarcodeDigits } from "@/lib/barcode/normalization";
import { getActivePickingTargetCellIdByUnitId } from "@/lib/units/active-picking-target-cell";

/**
 * GET /api/units/list
 * Returns list of units with filters
 * Query params:
 * - age: all | 24h | 48h | 7d (filter by time on warehouse)
 * - search: search by barcode (partial match)
 * - status: filter by status (bin, stored, picking, shipping, out, rejected, ff, all)
 *          OR by cell_type (bin, shipping) - filters units in cells of specific type
 * - ops: OPS статус (postponed_1, no_status, etc.) or "all"
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

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const ageFilter = searchParams.get("age") || "all";
    const searchQuery = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status") || "all";
    const opsFilter = searchParams.get("ops") || "all";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200", 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
    const normalizedSearchQuery = searchQuery.trim();
    const barcodeCandidates = buildBarcodeCandidates(normalizeBarcodeDigits(normalizedSearchQuery));

    // Calculate date threshold based on filter
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

    // Build query - specify explicit foreign key relationship
    let query = supabaseAdmin
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
        warehouse_cells!units_cell_id_fkey(code, cell_type)
      `)
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    let countQuery = supabaseAdmin
      .from("units")
      .select("id, warehouse_cells!units_cell_id_fkey(cell_type)", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id);

    // Apply status filter
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "on_warehouse") {
        // "На складе" - фильтруем по cell_type (более надежно, не зависит от enum)
        // Units на складе находятся в ячейках типов: bin, storage, shipping, picking, rejected, ff
        query = query.in("warehouse_cells.cell_type", ["bin", "storage", "shipping", "picking", "rejected", "ff"]);
        countQuery = countQuery.in("warehouse_cells.cell_type", ["bin", "storage", "shipping", "picking", "rejected", "ff"]);
      } else if (statusFilter === "bin") {
        // "BIN" - заказы в BIN ячейках (обычно со статусом bin)
        // Фильтруем по cell_type через join
        query = query.eq("warehouse_cells.cell_type", "bin");
        countQuery = countQuery.eq("warehouse_cells.cell_type", "bin");
      } else if (statusFilter === "shipping") {
        // "Shipping" - заказы в shipping ячейках
        // Фильтруем по cell_type через join
        query = query.eq("warehouse_cells.cell_type", "shipping");
        countQuery = countQuery.eq("warehouse_cells.cell_type", "shipping");
      } else {
        query = query.eq("status", statusFilter);
        countQuery = countQuery.eq("status", statusFilter);
      }
    }

    // Apply age filter
    if (dateThreshold) {
      query = query.lt("created_at", dateThreshold);
      countQuery = countQuery.lt("created_at", dateThreshold);
    }

    // Apply OPS status filter (meta.ops_status)
    if (opsFilter && opsFilter !== "all") {
      if (opsFilter === "no_status") {
        query = (query as any).is("meta->>ops_status", null);
        countQuery = (countQuery as any).is("meta->>ops_status", null);
      } else {
        query = query.contains("meta", { ops_status: opsFilter });
        countQuery = countQuery.contains("meta", { ops_status: opsFilter });
      }
    }

    const isBarcodeSearch = Boolean(normalizedSearchQuery) && barcodeCandidates.length > 0;

    let totalCount: number | null = null;
    let effectiveUnits: any[] = [];

    if (isBarcodeSearch) {
      // Fast path: search by barcode -> fetch only matching units.
      let barcodeQuery = supabaseAdmin
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
          warehouse_cells!units_cell_id_fkey(code, cell_type)
        `)
        .eq("warehouse_id", profile.warehouse_id)
        .in("barcode", barcodeCandidates)
        .order("created_at", { ascending: false })
        .limit(50);

      if (statusFilter && statusFilter !== "all" && statusFilter !== "on_warehouse" && statusFilter !== "bin" && statusFilter !== "shipping") {
        barcodeQuery = barcodeQuery.eq("status", statusFilter);
      }
      if (dateThreshold) {
        barcodeQuery = barcodeQuery.lt("created_at", dateThreshold);
      }
      if (opsFilter && opsFilter !== "all") {
        if (opsFilter === "no_status") {
          barcodeQuery = (barcodeQuery as any).is("meta->>ops_status", null);
        } else {
          barcodeQuery = barcodeQuery.contains("meta", { ops_status: opsFilter });
        }
      }

      const { data: barcodeHits, error: barcodeErr } = await barcodeQuery;
      if (barcodeErr) {
        console.error("Units list barcodeQuery error:", barcodeErr);
        return NextResponse.json({ error: "Failed to load units" }, { status: 500 });
      }
      effectiveUnits = Array.isArray(barcodeHits) ? barcodeHits : [];
      totalCount = effectiveUnits.length;
    } else {
      const { count } = await countQuery;
      totalCount = typeof count === "number" ? count : null;

      const { data: units, error: unitsError } = await query;
      if (unitsError) {
        console.error("Units list error:", unitsError);
        return NextResponse.json(
          { error: "Failed to load units" },
          { status: 500 }
        );
      }
      effectiveUnits = units || [];
    }

    // По факту: ячейку для отображения берём из warehouse_cells_map; при рассинхроне — по status (rejected/ff).
    // Если cell_id пустой, но есть активная picking-задача с target — показываем эту ячейку (как на карте / в find).
    // "Фактическое местонахождение" приоритетнее: последняя запись unit_moves.to_cell_id (если есть).

    // 1) Сначала грузим lastMove (быстро определяет фактическую ячейку для большинства).
    const lastMoveToCellIdByUnitId = new Map<string, string>();
    try {
      const allUnitIds = effectiveUnits.map((u: any) => u.id).filter(Boolean);
      const chunkSize = 200;
      for (let i = 0; i < allUnitIds.length; i += chunkSize) {
        const chunk = allUnitIds.slice(i, i + chunkSize);
        const { data: moves } = await supabaseAdmin
          .from("unit_moves")
          .select("unit_id, to_cell_id, created_at")
          .in("unit_id", chunk)
          .order("created_at", { ascending: false })
          .limit(1000);
        (moves ?? []).forEach((m: any) => {
          if (!m?.unit_id || !m?.to_cell_id) return;
          if (!lastMoveToCellIdByUnitId.has(m.unit_id)) {
            lastMoveToCellIdByUnitId.set(m.unit_id, m.to_cell_id);
          }
        });
      }
    } catch {
      // ignore
    }

    // 2) Только если нет ни lastMove, ни physical cell — пробуем active picking target (обычно очень мало).
    const unitIdsNeedPickingTarget = effectiveUnits
      .filter((u: any) => !lastMoveToCellIdByUnitId.get(u.id) && !u.cell_id)
      .map((u: any) => u.id);
    const pickingTargetCellIdByUnitId = await getActivePickingTargetCellIdByUnitId(
      profile.warehouse_id,
      unitIdsNeedPickingTarget,
    );

    const physicalCellIds = [...new Set(effectiveUnits.map((u: any) => u.cell_id).filter(Boolean))];
    const taskTargetCellIds = [...new Set(pickingTargetCellIdByUnitId.values())];
    const moveCellIdsInitial = [...new Set([...lastMoveToCellIdByUnitId.values()].filter(Boolean))];
    const cellIds = [...new Set([...physicalCellIds, ...taskTargetCellIds, ...moveCellIdsInitial])];
    const cellsMap = new Map<string, { code: string; cell_type: string }>();
    if (cellIds.length > 0) {
      const { data: cells } = await supabaseAdmin
        .from("warehouse_cells_map")
        .select("id, code, cell_type")
        .eq("warehouse_id", profile.warehouse_id)
        .in("id", cellIds);
      cells?.forEach((c: any) => cellsMap.set(c.id, { code: c.code, cell_type: c.cell_type }));
    }
    let rejectedCell: { id: string; code: string; cell_type: string } | null = null;
    let ffCell: { id: string; code: string; cell_type: string } | null = null;
    const { data: statusCells } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type")
      .eq("warehouse_id", profile.warehouse_id)
      .in("cell_type", ["rejected", "ff"]);
    statusCells?.forEach((c: any) => {
      cellsMap.set(c.id, { code: c.code, cell_type: c.cell_type });
      if (c.cell_type === "rejected") rejectedCell = rejectedCell ?? c;
      if (c.cell_type === "ff") ffCell = ffCell ?? c;
    });

    // (cellsMap already includes move cells via cellIds; keep a small check for any misses)
    const moveCellIds = [...new Set([...lastMoveToCellIdByUnitId.values()].filter(Boolean))];
    const missingMoveCellIds = moveCellIds.filter((id) => !cellsMap.has(id));

    function getDisplayCell(unit: any): { code: string; cell_type: string } | null {
      const resolvedCellId =
        lastMoveToCellIdByUnitId.get(unit.id) ||
        unit.cell_id ||
        pickingTargetCellIdByUnitId.get(unit.id) ||
        null;
      const raw = resolvedCellId ? cellsMap.get(resolvedCellId) : null;
      if (raw) return raw;
      if (unit.status === "rejected" && rejectedCell) return rejectedCell;
      if (unit.status === "ff" && ffCell) return ffCell;
      return unit.warehouse_cells
        ? { code: unit.warehouse_cells.code, cell_type: unit.warehouse_cells.cell_type }
        : null;
    }

    // stay_start: last time unit "entered" warehouse (reset after return). If never returned = created_at.
    const allUnitIds = effectiveUnits.map((u: any) => u.id);
    const lastReturnedAtByUnitId = new Map<string, string>();
    if (allUnitIds.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < allUnitIds.length; i += batchSize) {
        const batch = allUnitIds.slice(i, i + batchSize);
        const { data: returnedRows } = await supabaseAdmin
          .from("outbound_shipments")
          .select("unit_id, returned_at")
          .eq("warehouse_id", profile.warehouse_id)
          .eq("status", "returned")
          .in("unit_id", batch)
          .not("returned_at", "is", null)
          .order("returned_at", { ascending: false });
        if (returnedRows?.length) {
          returnedRows.forEach((r: { unit_id: string; returned_at: string }) => {
            if (r.unit_id && r.returned_at && !lastReturnedAtByUnitId.has(r.unit_id)) {
              lastReturnedAtByUnitId.set(r.unit_id, r.returned_at);
            }
          });
        }
      }
    }

    // For shipped/out units: get latest out_at so age stops at leave
    const shippedOutUnits = effectiveUnits.filter((u: any) => u.status === "shipped" || u.status === "out");
    const shippedOutIds = shippedOutUnits.map((u: any) => u.id);
    const outAtByUnitId = new Map<string, string>();
    if (shippedOutIds.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < shippedOutIds.length; i += batchSize) {
        const batch = shippedOutIds.slice(i, i + batchSize);
        const { data: outShipments } = await supabaseAdmin
          .from("outbound_shipments")
          .select("unit_id, out_at")
          .eq("warehouse_id", profile.warehouse_id)
          .in("unit_id", batch)
          .order("out_at", { ascending: false });
        if (outShipments?.length) {
          outShipments.forEach((s: { unit_id: string; out_at: string }) => {
            if (s.unit_id && s.out_at && !outAtByUnitId.has(s.unit_id)) {
              outAtByUnitId.set(s.unit_id, s.out_at);
            }
          });
        }
      }
    }

    // Age = time on warehouse in current stay (from stay_start to end). stay_start resets after return.
    const unitsWithAge = effectiveUnits.map((unit: any) => {
      const stayStart = lastReturnedAtByUnitId.get(unit.id) || unit.created_at;
      const stayStartTime = new Date(stayStart).getTime();
      const isLeftWarehouse = unit.status === "shipped" || unit.status === "out";
      const outAt = isLeftWarehouse ? outAtByUnitId.get(unit.id) : null;
      const endTime = outAt ? new Date(outAt).getTime() : now.getTime();
      const ageHours = Math.floor((endTime - stayStartTime) / (1000 * 60 * 60));
      const cell = getDisplayCell(unit);
      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        product_name: unit.product_name,
        partner_name: unit.partner_name,
        price: unit.price,
        cell_code: cell?.code ?? unit.warehouse_cells?.code,
        cell_type: cell?.cell_type ?? unit.warehouse_cells?.cell_type,
        created_at: unit.created_at,
        age_hours: ageHours,
        meta: unit.meta,
      };
    });

    function resolveLastWrittenScenario(meta: any): string | null {
      const merchantRejections = Array.isArray(meta?.merchant_rejections)
        ? meta.merchant_rejections
        : [];
      const serviceCenterReturns = Array.isArray(meta?.service_center_returns)
        ? meta.service_center_returns
        : [];

      const latestMerchantScenario =
        [...merchantRejections]
          .reverse()
          .find((item: any) => typeof item?.scenario === "string" && item.scenario.trim())
          ?.scenario || null;
      if (latestMerchantScenario) return String(latestMerchantScenario).trim();

      const latestServiceScenario =
        [...serviceCenterReturns]
          .reverse()
          .find((item: any) => typeof item?.scenario === "string" && item.scenario.trim())
          ?.scenario || null;
      if (latestServiceScenario) return String(latestServiceScenario).trim();

      return null;
    }

    function normalize(value: unknown): string {
      return String(value || "").toLowerCase().trim();
    }

    function matchesKeywords(unit: any, keywords: string[]): boolean {
      const lastWrittenScenario = resolveLastWrittenScenario(unit.meta);
      const haystack = [
        unit.barcode,
        unit.product_name,
        unit.partner_name,
        unit.status,
        unit.cell_code,
        unit.cell_type,
        unit.meta?.ops_status,
        unit.meta?.ops_status_comment,
        lastWrittenScenario,
      ]
        .map((v) => normalize(v))
        .filter(Boolean)
        .join(" ");

      return keywords.every((keyword) => haystack.includes(keyword));
    }

    let responseUnits = unitsWithAge;
    if (normalizedSearchQuery) {
      const keywords = normalizedSearchQuery
        .toLowerCase()
        .split(/\s+/)
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length > 0) {
        responseUnits = unitsWithAge.filter((unit) => matchesKeywords(unit, keywords));
      }
    }

    const total = normalizedSearchQuery
      ? responseUnits.length
      : typeof totalCount === "number"
      ? totalCount
      : responseUnits.length;

    return NextResponse.json({
      ok: true,
      units: responseUnits,
      total,
    });
  } catch (e: any) {
    console.error("List units error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

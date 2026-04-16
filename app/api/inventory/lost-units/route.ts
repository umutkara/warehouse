import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";

type LostItem = {
  barcode: string;
  cellCode: string;
  cellType: string;
  scannedBy: string | null;
  scannedByName: string | null;
  scannedAt: string | null;
  unitId: string | null;
  unitStatus: string | null;
  opsStatus: string | null;
  isFound: boolean;
};

async function resolveSessionId(supabase: Awaited<ReturnType<typeof supabaseServer>>, warehouseId: string, incomingSessionId: string | null) {
  if (incomingSessionId) return incomingSessionId;
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("inventory_session_id")
    .eq("id", warehouseId)
    .single();
  if (warehouse?.inventory_session_id) return warehouse.inventory_session_id as string;
  const { data: lastSession } = await supabase
    .from("inventory_sessions")
    .select("id")
    .eq("warehouse_id", warehouseId)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  return lastSession?.id || null;
}

async function buildLostItems(
  req: Request,
  sessionId: string,
  warehouseId: string,
): Promise<LostItem[]> {
  const reportUrl = new URL("/api/inventory/session-report", req.url);
  reportUrl.searchParams.set("sessionId", sessionId);
  const reportRes = await fetch(reportUrl.toString(), {
    headers: { cookie: req.headers.get("cookie") || "" },
  });
  if (!reportRes.ok) {
    throw new Error("Не удалось получить отчет инвентаризации");
  }
  const reportJson = await reportRes.json();
  const rows = Array.isArray(reportJson?.rows) ? reportJson.rows : [];

  const rawLost = rows.flatMap((row: any) => {
    const lostBarcodes = Array.isArray(row?.lost)
      ? row.lost
      : Array.isArray(row?.missing)
        ? row.missing
        : [];
    return lostBarcodes.map((barcode: string) => ({
      barcode,
      cellCode: row?.cell?.code || "—",
      cellType: row?.cell?.cell_type || "—",
      scannedBy: row?.scannedBy || null,
      scannedByName: row?.scannedByName || null,
      scannedAt: row?.scannedAt || null,
    }));
  });

  const byBarcode = new Map<string, Omit<LostItem, "unitId" | "unitStatus" | "opsStatus" | "isFound">>();
  rawLost.forEach((item: any) => {
    if (!item?.barcode) return;
    if (!byBarcode.has(item.barcode)) {
      byBarcode.set(item.barcode, item);
    }
  });

  const barcodes = Array.from(byBarcode.keys());
  if (barcodes.length === 0) return [];

  const { data: units } = await supabaseAdmin
    .from("units")
    .select("id, barcode, status, meta")
    .eq("warehouse_id", warehouseId)
    .in("barcode", barcodes);

  const unitsByBarcode = new Map<string, { id: string; status: string | null; opsStatus: string | null }>();
  (units || []).forEach((unit: any) => {
    if (!unit?.barcode) return;
    unitsByBarcode.set(unit.barcode, {
      id: unit.id,
      status: unit.status || null,
      opsStatus: unit?.meta?.ops_status || null,
    });
  });

  return barcodes.map((barcode) => {
    const base = byBarcode.get(barcode)!;
    const unit = unitsByBarcode.get(barcode) || null;
    const opsStatus = unit?.opsStatus || null;
    return {
      ...base,
      unitId: unit?.id || null,
      unitStatus: unit?.status || null,
      opsStatus,
      isFound: opsStatus === "found",
    };
  });
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id, role")
      .eq("id", authData.user.id)
      .single();
    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }

    const url = new URL(req.url);
    const sessionId = await resolveSessionId(supabase, profile.warehouse_id, url.searchParams.get("sessionId"));
    if (!sessionId) {
      return NextResponse.json({ error: "Сессия инвентаризации не найдена" }, { status: 404 });
    }

    const lostItems = await buildLostItems(req, sessionId, profile.warehouse_id);
    const foundCount = lostItems.filter((item) => item.isFound).length;
    const unresolvedCount = lostItems.length - foundCount;

    return NextResponse.json({
      ok: true,
      sessionId,
      totals: {
        lostTotal: lostItems.length,
        foundCount,
        unresolvedCount,
      },
      lostUnits: lostItems,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id, role, full_name")
      .eq("id", authData.user.id)
      .single();
    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }
    if (!profile.role || !hasAnyRole(profile.role, ["admin", "head", "manager", "ops", "logistics"])) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const barcode = String(body?.barcode || "").trim();
    const sessionIdRaw = String(body?.sessionId || "").trim();
    const comment = String(body?.comment || "").trim();
    if (!barcode) {
      return NextResponse.json({ error: "barcode обязателен" }, { status: 400 });
    }
    const sessionId = await resolveSessionId(supabase, profile.warehouse_id, sessionIdRaw || null);
    if (!sessionId) {
      return NextResponse.json({ error: "Сессия инвентаризации не найдена" }, { status: 404 });
    }

    const lostItems = await buildLostItems(req, sessionId, profile.warehouse_id);
    const target = lostItems.find((item) => item.barcode === barcode);
    if (!target) {
      return NextResponse.json({ error: "Заказ не числится в потерянных по этой сессии" }, { status: 409 });
    }
    if (!target.unitId) {
      return NextResponse.json({ error: "Юнит не найден в системе для этого штрихкода" }, { status: 404 });
    }
    if (target.isFound) {
      return NextResponse.json({ ok: true, alreadyFound: true, unitId: target.unitId, barcode });
    }

    const { data: currentUnit } = await supabaseAdmin
      .from("units")
      .select("id, meta")
      .eq("id", target.unitId)
      .eq("warehouse_id", profile.warehouse_id)
      .single();
    const currentMeta = currentUnit?.meta || {};
    const nextMeta = {
      ...currentMeta,
      ops_status: "found",
      ops_status_comment:
        comment || `Найден после инвентаризации, сессия ${sessionId}`,
    };

    const { error: updateError } = await supabaseAdmin
      .from("units")
      .update({ meta: nextMeta })
      .eq("id", target.unitId)
      .eq("warehouse_id", profile.warehouse_id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase.rpc("audit_log_event", {
      p_action: "inventory.lost_unit_found",
      p_entity_type: "unit",
      p_entity_id: target.unitId,
      p_summary: `Потерянный по инвентаризации заказ отмечен как найден: ${barcode}`,
      p_meta: {
        barcode,
        session_id: sessionId,
        cell_code: target.cellCode,
        actor_name: profile.full_name || authData.user.id,
        comment: nextMeta.ops_status_comment,
      },
    });

    return NextResponse.json({
      ok: true,
      barcode,
      unitId: target.unitId,
      opsStatus: "found",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/units/export-excel
 * Exports units to Excel with last action info
 * Query params:
 * - age: all | 24h | 48h | 7d
 * - status: on_warehouse | bin | stored | picking | shipping | out | rejected | ff | all
 * - search: search by barcode
 * - ops: OPS статус or "all"
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
      .select("warehouse_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const ageFilter = searchParams.get("age") || "all";
    const searchQuery = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status") || "on_warehouse";
    const opsFilter = searchParams.get("ops") || "all";

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

    // Build query
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
      .order("created_at", { ascending: false });

    // Apply status filter
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "on_warehouse") {
        query = query.in("status", ["bin", "stored", "picking", "shipping", "rejected", "ff"]);
      } else {
        query = query.eq("status", statusFilter);
      }
    }

    // Apply search filter
    if (searchQuery.trim()) {
      query = query.ilike("barcode", `%${searchQuery.trim()}%`);
    }

    // Apply age filter
    if (dateThreshold) {
      query = query.lt("created_at", dateThreshold);
    }

    // Apply OPS status filter
    if (opsFilter && opsFilter !== "all") {
      if (opsFilter === "no_status") {
        query = (query as any).is("meta->>ops_status", null);
      } else {
        query = query.contains("meta", { ops_status: opsFilter });
      }
    }

    const { data: units, error: unitsError } = await query;

    if (unitsError) {
      console.error("Units export error:", unitsError);
      return NextResponse.json({ error: "Failed to load units" }, { status: 500 });
    }

    // Get last action for each unit
    const unitIds = (units || []).map((u: any) => u.id);
    
    const { data: lastActions } = await supabaseAdmin
      .from("unit_moves")
      .select("unit_id, created_at, from_cell_id, to_cell_id, moved_by, note")
      .in("unit_id", unitIds)
      .order("created_at", { ascending: false });

    // Group last actions by unit_id
    const lastActionMap: Record<string, any> = {};
    (lastActions || []).forEach((action: any) => {
      if (!lastActionMap[action.unit_id]) {
        lastActionMap[action.unit_id] = action;
      }
    });

    // Generate CSV (simple format that Excel can open)
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

    const rows = (units || []).map((unit: any) => {
      const createdAt = new Date(unit.created_at);
      const ageHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
      const lastAction = lastActionMap[unit.id];
      
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

      return [
        unit.barcode || "",
        unit.status || "",
        unit.product_name || "",
        unit.partner_name || "",
        unit.price ? unit.price.toFixed(2) : "",
        unit.warehouse_cells?.code || "",
        unit.warehouse_cells?.cell_type || "",
        createdAt.toLocaleString("ru-RU"),
        ageHours.toString(),
        lastActionText,
        lastActionDate,
      ];
    });

    // Generate CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => 
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    // Add BOM for UTF-8 Excel compatibility
    const bom = "\uFEFF";
    const csvWithBom = bom + csvContent;

    // Return as downloadable file
    return new Response(csvWithBom, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="units_on_warehouse_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (e: any) {
    console.error("Export error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const ALLOWED_STATUSES = ["bin", "stored", "picking", "shipping", "out"] as const;
type UnitStatus = typeof ALLOWED_STATUSES[number];

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const unitId = body?.unitId;
    const toCellId = body?.toCellId;
    let toStatus: UnitStatus | null = body?.toStatus || null;

    if (!unitId) {
      return NextResponse.json({ error: "unitId is required" }, { status: 400 });
    }

    if (!toCellId) {
      return NextResponse.json({ error: "toCellId is required" }, { status: 400 });
    }

    // Validate toStatus if provided
    if (toStatus !== null && toStatus !== undefined) {
      if (typeof toStatus !== 'string' || !ALLOWED_STATUSES.includes(toStatus as UnitStatus)) {
        return NextResponse.json(
          { 
            error: `Invalid toStatus. Must be one of: ${ALLOWED_STATUSES.join(", ")} or null`,
            provided: toStatus
          },
          { status: 400 }
        );
      }
    } else {
      toStatus = null; // Explicitly set to null if not provided
    }

    // Call RPC function - single source of truth for cell-to-cell moves
    const { data: rpcResult, error: rpcError } = await supabase.rpc('move_unit_to_cell', {
      p_unit_id: unitId,
      p_to_cell_id: toCellId,
      p_to_status: toStatus
    });

    if (rpcError) {
      console.error("units/move RPC error:", rpcError);
      // Проверка на блокировку инвентаризации
      if (rpcError.message && rpcError.message.includes('INVENTORY_ACTIVE')) {
        return NextResponse.json(
          { error: "Инвентаризация активна. Перемещения заблокированы." },
          { status: 423 }
        );
      }
      return NextResponse.json(
        { 
          error: rpcError.message || "RPC call failed",
          code: rpcError.code,
          details: rpcError.details,
          hint: rpcError.hint
        },
        { status: 500 }
      );
    }

    // RPC returns JSON, parse if needed
    const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;

    if (!result.ok) {
      // Map common errors to appropriate status codes
      const errorMsg = result.error || "Move failed";
      let statusCode = 400;
      
      if (errorMsg.includes("not found")) {
        statusCode = 404;
      } else if (errorMsg.includes("Unauthorized")) {
        statusCode = 401;
      } else if (errorMsg.includes("different warehouse") || errorMsg.includes("Forbidden")) {
        statusCode = 403;
      } else if (errorMsg.includes("blocked") || errorMsg.includes("inactive")) {
        statusCode = 400;
      }

      return NextResponse.json(
        { error: errorMsg },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      ok: true,
      unitId: result.unitId,
      fromCellId: result.fromCellId,
      toCellId: result.toCellId,
      toStatus: result.toStatus
    });

  } catch (e: any) {
    console.error("units/move fatal:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
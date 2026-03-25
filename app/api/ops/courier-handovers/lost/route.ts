import { NextResponse } from "next/server";

import {
  loadComputedHandovers,
  requireWarehouseHandoverAccess,
} from "@/app/api/ops/courier-handovers/_shared";

export async function GET() {
  const auth = await requireWarehouseHandoverAccess();
  if (!auth.ok) return auth.response;

  try {
    const handovers = await loadComputedHandovers({
      warehouseId: auth.profile.warehouse_id,
      statuses: ["confirmed"],
    });

    const lost_items = handovers
      .flatMap((handover) =>
        handover.lost_items.map((item) => ({
          ...item,
          courier_user_id: handover.courier_user_id,
          courier_name: handover.courier_name,
          handover_session_id: handover.handover_session_id,
          shift_id: handover.shift_id,
          handover_confirmed_at: handover.confirmed_at,
        })),
      )
      .sort((a, b) => Date.parse(b.lost_at || "") - Date.parse(a.lost_at || ""));

    return NextResponse.json({
      ok: true,
      lost_items,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load lost courier items" },
      { status: 500 },
    );
  }
}

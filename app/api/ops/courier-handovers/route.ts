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
      statuses: ["draft"],
    });

    return NextResponse.json({
      ok: true,
      handovers,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load courier handovers" },
      { status: 500 },
    );
  }
}

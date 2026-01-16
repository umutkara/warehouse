import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type Zone = "receiving" | "bin" | "storage" | "shipping" | "transfer";

export async function GET() {
  const supabase = await supabaseServer();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 401 });
  }

  const user = auth?.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (!profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
  }

  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, cell_id")
    .eq("warehouse_id", profile.warehouse_id);

  if (unitsError) {
    return NextResponse.json({ error: unitsError.message }, { status: 400 });
  }

  const cellIds = Array.from(new Set((units ?? []).map((u) => u.cell_id).filter(Boolean))) as string[];

  let cellTypeById: Record<string, Zone> = {};
  if (cellIds.length > 0) {
    const { data: cells, error: cellsError } = await supabase
      .from("warehouse_cells")
      .select("id, cell_type")
      .in("id", cellIds)
      .eq("warehouse_id", profile.warehouse_id);

    if (cellsError) {
      return NextResponse.json({ error: cellsError.message }, { status: 400 });
    }

    for (const cell of cells ?? []) {
      cellTypeById[cell.id] = cell.cell_type as Zone;
    }
  }

  const counts: Record<Zone, number> = {
    receiving: 0,
    bin: 0,
    storage: 0,
    shipping: 0,
    transfer: 0,
  };

  let unplaced = 0;

  for (const unit of units ?? []) {
    if (!unit.cell_id) {
      unplaced += 1;
      continue;
    }
    const zone = cellTypeById[unit.cell_id];
    if (zone && counts[zone] !== undefined) {
      counts[zone] += 1;
    }
  }

  return NextResponse.json({
    counts,
    unplaced,
    total: (units ?? []).length,
  });
}

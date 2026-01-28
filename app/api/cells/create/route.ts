import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = userData.user;

  // Get user profile and role
  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  // Role check: only admin, head, manager can create cells
  if (!["admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { code, cellType } = body ?? {};

  if (!code || !cellType) {
    return NextResponse.json({ error: "code and cellType are required" }, { status: 400 });
  }

  // Validate cellType
  const validCellTypes = ["bin", "storage", "picking", "shipping", "receiving", "transfer", "surplus", "rejected", "ff"];
  if (!validCellTypes.includes(cellType)) {
    return NextResponse.json({ error: `Invalid cellType. Must be one of: ${validCellTypes.join(", ")}` }, { status: 400 });
  }

  // Check if cell code already exists in this warehouse
  const { data: existing } = await supabaseAdmin
    .from("warehouse_cells")
    .select("id")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("code", code)
    .single();

  if (existing) {
    return NextResponse.json({ error: `Cell with code "${code}" already exists` }, { status: 400 });
  }

  // Create new cell (use admin to bypass RLS)
  const { data: newCell, error: insertError } = await supabaseAdmin
    .from("warehouse_cells")
    .insert({
      warehouse_id: profile.warehouse_id,
      code: code.trim().toUpperCase(),
      cell_type: cellType,
      x: 100, // Default position
      y: 100,
      w: 80,  // Default size
      h: 60,
      is_active: true,
      meta: {},
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Audit log
  await supabase.rpc("audit_log_event", {
    p_action: "cell.create",
    p_entity_type: "cell",
    p_entity_id: newCell.id,
    p_summary: `Создана ячейка: ${code} (${cellType})`,
    p_meta: {
      code,
      cell_type: cellType,
    },
  });

  return NextResponse.json({ ok: true, cell: newCell });
}

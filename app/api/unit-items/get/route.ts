import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId");
  if (!unitId) {
    return NextResponse.json({ error: "Missing unitId" }, { status: 400 });
  }

  // profile.warehouse_id (profiles.id = auth.uid())
  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError) {
    return NextResponse.json(
      { error: "Failed to load profile", details: profError.message },
      { status: 500 }
    );
  }

  if (!profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  // verify unit belongs to this warehouse
  const { data: unitData, error: unitError } = await supabase
    .from("units")
    .select("id")
    .eq("id", unitId)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (unitError) {
    return NextResponse.json(
      { error: "Failed to load unit", details: unitError.message },
      { status: 500 }
    );
  }

  if (!unitData) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  // Get unit_item (may be null)
  const { data: itemData, error: itemError } = await supabase
    .from("unit_items")
    .select("unit_id, title, sku, vendor, image_url, meta, created_at, updated_at")
    .eq("unit_id", unitId)
    .maybeSingle();

  if (itemError) {
    return NextResponse.json(
      { error: "Failed to load unit item", details: itemError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ item: itemData ?? null });
}

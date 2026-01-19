import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/units/[unitId]/history
 * Returns comprehensive history of unit movements and events
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ unitId: string }> | { unitId: string } }
) {
  const supabase = await supabaseServer();
  
  // Await params for Next.js App Router compatibility
  const resolvedParams = await params;
  const unitId = resolvedParams.unitId;

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

    // Call RPC function to get comprehensive history
    const { data: historyData, error: historyError } = await supabase.rpc(
      "get_unit_history",
      { p_unit_id: unitId }
    );

    if (historyError) {
      console.error("History RPC error:", historyError);
      return NextResponse.json(
        { error: "Failed to load history", details: historyError.message },
        { status: 500 }
      );
    }

    // Check if RPC returned an error
    if (historyData && !historyData.ok) {
      console.error("History RPC returned error:", historyData);
      return NextResponse.json(
        { error: historyData.error || "Failed to load history" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      unit: historyData?.unit || null,
      history: historyData?.history || [],
    });
  } catch (e: any) {
    console.error("Get history error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

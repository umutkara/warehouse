import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/stats/active-tasks
 * Returns count of active picking tasks
 */
export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  try {
    // Count active picking tasks (pending + in_progress)
    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("picking_tasks")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id)
      .in("status", ["pending", "in_progress"]);

    if (tasksError) {
      console.error("Error counting active tasks:", tasksError);
      return NextResponse.json({ error: "Failed to count tasks" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      count: tasks || 0,
    });
  } catch (e: any) {
    console.error("Active tasks stats error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

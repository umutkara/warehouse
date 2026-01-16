import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, warehouse_id")
      .eq("id", authData.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!profile.role || !["admin", "head", "manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc("inventory_stop");

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message || "Failed to stop inventory" },
        { status: 400 }
      );
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to stop inventory" },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}

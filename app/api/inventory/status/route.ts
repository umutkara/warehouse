import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: authData, error: authError } = await supabase.auth.getUser();
    
    if (!authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc("inventory_status");

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message || "Failed to get inventory status" },
        { status: 400 }
      );
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to get inventory status" },
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

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasAnyRole } from "@/app/api/_shared/role-access";

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

    if (!profile.role || !hasAnyRole(profile.role, ["admin", "head", "manager"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc("inventory_cancel");

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message || "Ошибка отмены инвентаризации" },
        { status: 400 }
      );
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Ошибка отмены инвентаризации" },
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

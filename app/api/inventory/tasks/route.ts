import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Get profile and warehouse_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile?.warehouse_id) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }

    // Get sessionId from query or from active session
    const url = new URL(req.url);
    let sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      // Try to get from active session OR last session
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("inventory_session_id, inventory_active")
        .eq("id", profile.warehouse_id)
        .single();

      if (warehouse?.inventory_session_id) {
        // Use current or last session (даже если не активна)
        sessionId = warehouse.inventory_session_id;
      } else {
        // If no session_id on warehouse, try to find the most recent closed session
        const { data: lastSession } = await supabase
          .from("inventory_sessions")
          .select("id")
          .eq("warehouse_id", profile.warehouse_id)
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (lastSession) {
          sessionId = lastSession.id;
        } else {
          return NextResponse.json(
            { error: "Нет доступных сессий инвентаризации" },
            { status: 400 }
          );
        }
      }
    }

    // Use RPC to get tasks
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "inventory_get_tasks",
      { p_session_id: sessionId }
    );

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message || "Ошибка получения заданий" },
        { status: 400 }
      );
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Ошибка получения заданий" },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    console.error("inventory/tasks error:", e);
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

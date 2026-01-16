import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const unitId = body?.unitId ?? body?.p_unit_id;
    const cellId = body?.cellId ?? body?.p_to_cell_id ?? null;
    const toStatus = body?.toStatus ?? body?.p_to_status ?? "stored";

    if (!unitId) {
      return NextResponse.json({ error: "unitId is required" }, { status: 400 });
    }

    const supabase = await supabaseServer();

    // auth check (важно чтобы не было "тихого" null)
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("move_unit", {
      p_unit_id: unitId,
      p_to_status: toStatus ?? "stored",
      p_to_cell_id: cellId ?? null,
    });

    if (error) {
      // ВАЖНО: возвращаем текст ошибки из Postgres
      return NextResponse.json(
        { error: error.message, details: error },
        { status: 400 }
      );
    }

    // если RPC вернул null — тоже считаем ошибкой
    if (!data) {
      return NextResponse.json(
        { error: "RPC returned null (move_unit)" },
        { status: 500 }
      );
    }

    // Проверяем, если RPC вернул {ok: false, error: "..."}
    if (typeof data === 'object' && 'ok' in data && data.ok === false) {
      return NextResponse.json(
        { error: data.error || "RPC returned error" },
        { status: 400 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    // ВСЕГДА JSON, иначе на фронте будет assignData=null
    return NextResponse.json(
      { error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}

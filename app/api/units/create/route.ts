import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const allowed = new Set(["worker", "manager", "head", "admin"]);

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
    console.log("Starting unit creation...");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    console.log("Auth check:", { user: !!user });

    if (!user) return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, warehouse_id")
      .eq("id", user.id)
      .single();

    console.log("Profile check:", { profile: !!profile, role: profile?.role, warehouseId: !!profile?.warehouse_id });

    if (!profile?.role || !allowed.has(profile.role)) {
      return NextResponse.json({ error: "Forbidden", ok: false }, { status: 403 });
    }

    if (!profile.warehouse_id) {
      return NextResponse.json({ error: "Не найден warehouse_id у профиля", ok: false }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    console.log("Request body:", body);

    const digits = String(body?.digits ?? "").trim();
    console.log("Digits:", { digits, isValid: /^\d+$/.test(digits) });

    if (!digits || !/^\d+$/.test(digits)) {
      return NextResponse.json({ error: "Digits only", ok: false }, { status: 400 });
    }

    // 1 заказ = 1 unit = 1 barcode
    console.log("Inserting unit...");
    const { data: createdUnit, error } = await supabase
      .from("units")
      .insert({
        barcode: digits,
        warehouse_id: profile.warehouse_id,
        status: "receiving"
      })
      .select("id, barcode, created_at, warehouse_id")
      .single();

    console.log("Insert result:", { createdUnit: !!createdUnit, error });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: error.message, ok: false }, { status: 400 });
    }

    // Audit logging for unit creation
    const { error: auditError } = await supabase.rpc("audit_log_event", {
      p_action: "unit.create",
      p_entity_type: "unit",
      p_entity_id: createdUnit.id,
      p_summary: `Создание unit ${createdUnit.barcode}`,
      p_meta: {
        barcode: createdUnit.barcode,
        status: "receiving",
      },
    });

    if (auditError) {
      console.error("Audit log error:", auditError);
      // Don't fail the request if audit logging fails
    }

    console.log("Unit creation successful:", createdUnit);

    return NextResponse.json({ unit: createdUnit, ok: true });
  } catch (e: any) {
    console.error("Unexpected error in create:", e);
    return NextResponse.json({ error: "Internal server error", ok: false }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const OPS_STATUS_LABELS: Record<string, string> = {
  in_progress: "В работе",
  partner_accepted_return: "Партнер принял на возврат",
  partner_rejected_return: "Партнер не принял на возврат",
  sent_to_sc: "Передан в СЦ",
  delivered_to_rc: "Товар доставлен на РЦ",
  client_accepted: "Клиент принял",
  client_rejected: "Клиент не принял",
  sent_to_client: "Товар отправлен клиенту",
  delivered_to_pudo: "Товар доставлен на ПУДО",
  case_cancelled_cc: "Кейс отменен (Направлен КК)",
  postponed_1: "Перенос",
  postponed_2: "Перенос 2",
  warehouse_did_not_issue: "Склад не выдал",
  no_report: "Отчета нет",
};

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const barcode = (url.searchParams.get("barcode") ?? "").trim();

  if (!barcode) {
    return NextResponse.json({ error: "barcode is required" }, { status: 400 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  if (!["worker", "ops", "admin", "head", "manager", "logistics"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: unit, error: unitError } = await supabaseAdmin
    .from("units")
    .select("id, barcode, meta")
    .eq("barcode", barcode)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (unitError || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const opsStatus = unit.meta?.ops_status ?? null;
  const opsStatusLabel = opsStatus ? OPS_STATUS_LABELS[opsStatus] || opsStatus : null;

  // Find scenario from active tasks
  let scenario: string | null = null;

  const { data: taskUnits } = await supabaseAdmin
    .from("picking_task_units")
    .select("picking_task_id")
    .eq("unit_id", unit.id);

  const taskIds = (taskUnits || []).map((t: any) => t.picking_task_id).filter(Boolean);

  if (taskIds.length > 0) {
    const { data: tasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, scenario, status, created_at")
      .in("id", taskIds)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1);

    scenario = tasks?.[0]?.scenario ?? null;
  }

  if (!scenario) {
    const { data: legacyTask } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, scenario, status, created_at")
      .eq("unit_id", unit.id)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    scenario = legacyTask?.scenario ?? null;
  }

  return NextResponse.json({
    ok: true,
    ops_status: opsStatus,
    ops_status_label: opsStatusLabel,
    scenario,
  });
}

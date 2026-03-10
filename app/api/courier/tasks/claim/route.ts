import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const poolId = body?.poolId?.toString();
  const note = body?.note?.toString() || null;
  if (!poolId) {
    return NextResponse.json({ error: "poolId is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: claimedPool, error: claimError } = await supabaseAdmin
    .from("courier_task_pool")
    .update({
      status: "claimed",
      claim_note: note,
      updated_at: now,
      meta: {
        source: "api.courier.tasks.claim",
        claimed_by: auth.user.id,
      },
    })
    .eq("id", poolId)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("status", "available")
    .select("id, unit_id, zone_id, meta")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimedPool) {
    return NextResponse.json({ error: "Task already claimed or unavailable" }, { status: 409 });
  }

  const assignedCourierId = claimedPool?.meta?.assigned_courier_user_id;
  if (assignedCourierId && assignedCourierId !== auth.user.id) {
    await supabaseAdmin
      .from("courier_task_pool")
      .update({ status: "available", updated_at: new Date().toISOString() })
      .eq("id", claimedPool.id);
    return NextResponse.json({ error: "Task assigned to another courier" }, { status: 403 });
  }

  const { data: shift } = await supabaseAdmin
    .from("courier_shifts")
    .select("id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: task, error: taskError } = await supabaseAdmin
    .from("courier_tasks")
    .insert({
      warehouse_id: auth.profile.warehouse_id,
      pool_id: claimedPool.id,
      shift_id: shift?.id ?? null,
      unit_id: claimedPool.unit_id,
      courier_user_id: auth.user.id,
      zone_id: claimedPool.zone_id,
      status: "claimed",
      claimed_at: now,
      last_event_at: now,
      meta: { source: "api.courier.tasks.claim", note },
    })
    .select("id, unit_id, status, claimed_at")
    .single();

  if (taskError || !task) {
    await supabaseAdmin
      .from("courier_task_pool")
      .update({ status: "available", updated_at: new Date().toISOString() })
      .eq("id", claimedPool.id);
    return NextResponse.json({ error: taskError?.message || "Failed to claim task" }, { status: 500 });
  }

  await supabaseAdmin
    .from("courier_task_events")
    .insert({
      warehouse_id: auth.profile.warehouse_id,
      task_id: task.id,
      unit_id: task.unit_id,
      courier_user_id: auth.user.id,
      shift_id: shift?.id ?? null,
      event_id: `claim-${task.id}`,
      event_type: "claimed",
      happened_at: now,
      note,
      meta: { source: "api.courier.tasks.claim" },
    });

  return NextResponse.json({ ok: true, task });
}

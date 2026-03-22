#!/usr/bin/env node
/**
 * Reassign dropped unit by barcode to courier.
 * Usage: node scripts/reassign-dropped.mjs <barcode> [courierUserId]
 * If courierUserId omitted, uses the courier who dropped it.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const barcode = process.argv[2]?.trim();
if (!barcode) {
  console.error("Usage: node scripts/reassign-dropped.mjs <barcode> [courierUserId]");
  process.exit(1);
}

async function main() {
  const { data: unit, error: unitErr } = await supabase
    .from("units")
    .select("id, warehouse_id, barcode")
    .eq("barcode", barcode)
    .maybeSingle();

  if (unitErr) {
    console.error("Unit lookup failed:", unitErr.message);
    process.exit(1);
  }
  if (!unit) {
    console.error("Unit not found for barcode:", barcode);
    process.exit(1);
  }

  let courierUserId = process.argv[3]?.trim();
  if (!courierUserId) {
    const { data: dropEvent } = await supabase
      .from("courier_task_events")
      .select("courier_user_id")
      .eq("warehouse_id", unit.warehouse_id)
      .eq("unit_id", unit.id)
      .eq("event_type", "dropped")
      .order("happened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!dropEvent?.courier_user_id) {
      console.error("No drop event found for unit, or no courier. Pass courierUserId explicitly.");
      process.exit(1);
    }
    courierUserId = dropEvent.courier_user_id;
  }

  const { data: courier } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", courierUserId)
    .single();

  if (!courier) {
    console.error("Courier not found:", courierUserId);
    process.exit(1);
  }

  const { data: openShift } = await supabase
    .from("courier_shifts")
    .select("id")
    .eq("warehouse_id", unit.warehouse_id)
    .eq("courier_user_id", courierUserId)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!openShift) {
    console.error("Courier has no open shift. Cannot reassign.");
    process.exit(1);
  }

  const now = new Date().toISOString();

  const { data: shipment } = await supabase
    .from("outbound_shipments")
    .select("id")
    .eq("warehouse_id", unit.warehouse_id)
    .eq("unit_id", unit.id)
    .eq("status", "out")
    .order("out_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!shipment) {
    console.error("No OUT shipment for unit. Cannot reassign.");
    process.exit(1);
  }

  await supabase
    .from("outbound_shipments")
    .update({
      courier_user_id: courierUserId,
      courier_name: courier.full_name || "Courier",
      updated_at: now,
    })
    .eq("id", shipment.id)
    .eq("warehouse_id", unit.warehouse_id);

  const { data: existingTask } = await supabase
    .from("courier_tasks")
    .select("id")
    .eq("warehouse_id", unit.warehouse_id)
    .eq("unit_id", unit.id)
    .not("status", "in", "(delivered,failed,returned,canceled)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingTask) {
    await supabase
      .from("courier_tasks")
      .update({
        courier_user_id: courierUserId,
        shift_id: openShift.id,
        status: "claimed",
        claimed_at: now,
        last_event_at: now,
        updated_at: now,
      })
      .eq("id", existingTask.id);
  } else {
    await supabase.from("courier_tasks").insert({
      warehouse_id: unit.warehouse_id,
      pool_id: null,
      shift_id: openShift.id,
      unit_id: unit.id,
      courier_user_id: courierUserId,
      zone_id: null,
      status: "claimed",
      claimed_at: now,
      last_event_at: now,
      meta: { source: "script.reassign_dropped" },
    });
  }

  const taskRows = await supabase
    .from("courier_tasks")
    .select("id")
    .eq("warehouse_id", unit.warehouse_id)
    .eq("unit_id", unit.id)
    .eq("status", "claimed")
    .order("created_at", { ascending: false })
    .limit(1);
  const taskId = taskRows.data?.[0]?.id;

  if (taskId) {
    await supabase.from("courier_task_events").insert({
      warehouse_id: unit.warehouse_id,
      task_id: taskId,
      unit_id: unit.id,
      courier_user_id: courierUserId,
      shift_id: openShift.id,
      event_id: `reassign-${taskId}-${Date.now()}`,
      event_type: "claimed",
      happened_at: now,
      note: "Reassigned from script (return to courier)",
      meta: { source: "script.reassign_dropped" },
    });
  }

  console.log(`OK: Unit ${barcode} (${unit.id}) reassigned to ${courier.full_name} (${courierUserId})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Mark unit as picked up (убрать с карты дропов).
 * Usage: node scripts/mark-pickup-confirmed.mjs <barcode>
 * Sets courier_pickup_confirmed_at on outbound_shipment so the drop disappears from route planning map.
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
  console.error("Usage: node scripts/mark-pickup-confirmed.mjs <barcode>");
  process.exit(1);
}

async function main() {
  let { data: unit, error: unitErr } = await supabase
    .from("units")
    .select("id, warehouse_id, barcode")
    .eq("barcode", barcode)
    .maybeSingle();

  if (!unitErr && !unit) {
    const { data: units } = await supabase
      .from("units")
      .select("id, warehouse_id, barcode")
      .ilike("barcode", `%${barcode}%`)
      .limit(5);
    unit = units?.[0] || null;
  }

  if (unitErr) {
    console.error("Unit lookup failed:", unitErr.message);
    process.exit(1);
  }
  if (!unit) {
    console.error("Unit not found for barcode:", barcode);
    process.exit(1);
  }
  const u = unit;

  const { data: shipment, error: shipErr } = await supabase
    .from("outbound_shipments")
    .select("id, meta")
    .eq("warehouse_id", u.warehouse_id)
    .eq("unit_id", u.id)
    .eq("status", "out")
    .order("out_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shipErr) {
    console.error("Shipment lookup failed:", shipErr.message);
    process.exit(1);
  }
  if (!shipment) {
    console.error("No OUT shipment for unit. Nothing to update.");
    process.exit(1);
  }

  const now = new Date().toISOString();
  const existingMeta = (shipment.meta && typeof shipment.meta === "object" ? shipment.meta : {}) || {};
  const mergedMeta = {
    ...existingMeta,
    courier_pickup_confirmed_at: now,
    courier_pickup_confirmed_by: "script.mark_pickup_confirmed",
    courier_pickup_status: "confirmed",
  };

  const { error: updateErr } = await supabase
    .from("outbound_shipments")
    .update({ meta: mergedMeta, updated_at: now })
    .eq("id", shipment.id)
    .eq("warehouse_id", u.warehouse_id);

  if (updateErr) {
    console.error("Update failed:", updateErr.message);
    process.exit(1);
  }

  console.log(`OK: Unit ${u.barcode} (${u.id}) marked as picked up. Will disappear from route planning map.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { NextResponse } from "next/server";
import { requireUserProfile } from "@/app/api/_shared/user-profile";
import { supabaseServer } from "@/lib/supabase/server";
import { canEditRoutePlanning } from "@/lib/routeplanning/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";

const MAX_UNITS_PER_REQUEST = 150;

type AssignRequestBody = {
  unitIds?: unknown;
  courierUserId?: unknown;
  source?: unknown;
};

type SingleAssignResult = {
  unit_id: string;
  ok: boolean;
  status: number;
  error: string | null;
};

type AssignSource = "picking" | "dropped";

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUnitIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asTrimmedString(item))
      .filter((item): item is string => Boolean(item));
  }
  const single = asTrimmedString(value);
  return single ? [single] : [];
}

function parseErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybeError = (payload as Record<string, unknown>).error;
  return typeof maybeError === "string" && maybeError.trim().length > 0
    ? maybeError.trim()
    : null;
}

async function shipSingleUnit(
  request: Request,
  unitId: string,
  courierUserId: string,
): Promise<SingleAssignResult> {
  const targetUrl = new URL("/api/logistics/ship-out", request.url);
  const headers = new Headers({
    "Content-Type": "application/json",
    "x-routeplanning-assign": "1",
  });
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      unitId,
      courierUserId,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  return {
    unit_id: unitId,
    ok: Boolean(response.ok && payload && (payload as { ok?: boolean }).ok),
    status: response.status,
    error: parseErrorMessage(payload),
  };
}

async function reassignDroppedUnit(params: {
  warehouseId: string;
  unitId: string;
  courierUserId: string;
  courierName: string;
  assignedByUserId?: string;
}): Promise<SingleAssignResult> {
  const now = new Date().toISOString();
  const { warehouseId, unitId, courierUserId, courierName, assignedByUserId } = params;

  const { data: unitRow } = await supabaseAdmin
    .from("units")
    .select("barcode")
    .eq("id", unitId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();

  const { data: shipment, error: shipmentError } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id, status, meta")
    .eq("warehouse_id", warehouseId)
    .eq("unit_id", unitId)
    .eq("status", "out")
    .order("out_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (shipmentError) {
    return { unit_id: unitId, ok: false, status: 500, error: shipmentError.message };
  }
  if (!shipment) {
    return {
      unit_id: unitId,
      ok: false,
      status: 404,
      error: "Active OUT shipment not found for dropped reassignment",
    };
  }

  const shipmentMeta =
    shipment.meta && typeof shipment.meta === "object"
      ? (shipment.meta as Record<string, unknown>)
      : {};
  const mergedShipmentMeta = {
    ...shipmentMeta,
    reassigned_from_routeplanning_at: now,
    reassigned_from_routeplanning_to: courierUserId,
    assigned_from_logistics: true,
    courier_pickup_confirmed_at: null,
    courier_pickup_rejected_at: null,
  };
  const { error: shipmentUpdateError } = await supabaseAdmin
    .from("outbound_shipments")
    .update({
      courier_user_id: courierUserId,
      courier_name: courierName,
      updated_at: now,
      meta: mergedShipmentMeta,
    })
    .eq("id", shipment.id)
    .eq("warehouse_id", warehouseId);
  if (shipmentUpdateError) {
    return { unit_id: unitId, ok: false, status: 500, error: shipmentUpdateError.message };
  }

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: "logistics.dropped_reassigned",
    p_entity_type: "unit",
    p_entity_id: unitId,
    p_summary: `Логист назначил dropped на курьера: ${unitRow?.barcode || unitId} → ${courierName}`,
    p_meta: {
      source: "api.routeplanning.assign.dropped",
      unit_id: unitId,
      unit_barcode: unitRow?.barcode,
      courier_user_id: courierUserId,
      courier_name: courierName,
      shipment_id: shipment.id,
      assigned_by: assignedByUserId,
    },
  });

  return { unit_id: unitId, ok: true, status: 200, error: null };
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const auth = await requireUserProfile(supabase, {
    profileSelect: "warehouse_id, role",
  });
  if (!auth.ok) return auth.response;

  if (!canEditRoutePlanning(auth.profile.role)) {
    return NextResponse.json(
      { error: "Only logistics/admin can assign from routeplanning" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as AssignRequestBody | null;
  const unitIds = normalizeUnitIds(body?.unitIds);
  const courierUserId = asTrimmedString(body?.courierUserId);
  const source = asTrimmedString(body?.source) === "dropped" ? "dropped" : "picking";

  if (!unitIds.length) {
    return NextResponse.json({ error: "unitIds are required" }, { status: 400 });
  }

  if (unitIds.length > MAX_UNITS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Too many units in one request (${unitIds.length}). Limit is ${MAX_UNITS_PER_REQUEST}.`,
      },
      { status: 400 },
    );
  }

  if (!courierUserId) {
    return NextResponse.json({ error: "courierUserId is required" }, { status: 400 });
  }

  const { data: courierProfile, error: courierProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, warehouse_id, role, full_name")
    .eq("id", courierUserId)
    .maybeSingle();
  if (courierProfileError) {
    return NextResponse.json({ error: courierProfileError.message }, { status: 500 });
  }
  if (!courierProfile || courierProfile.warehouse_id !== auth.profile.warehouse_id) {
    return NextResponse.json({ error: "Courier not found in this warehouse" }, { status: 404 });
  }
  if (!hasAnyRole(courierProfile.role, ["courier"])) {
    return NextResponse.json({ error: "Selected user is not a courier" }, { status: 400 });
  }

  const { data: openShift, error: openShiftError } = await supabaseAdmin
    .from("courier_shifts")
    .select("id, status")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", courierUserId)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openShiftError) {
    return NextResponse.json({ error: openShiftError.message }, { status: 500 });
  }
  if (!openShift) {
    return NextResponse.json(
      { error: "Assignment is allowed only to on-shift couriers", code: "COURIER_NOT_ON_SHIFT" },
      { status: 409 },
    );
  }

  const settled = await Promise.allSettled(
    unitIds.map((unitId) =>
      source === "dropped"
        ? reassignDroppedUnit({
            warehouseId: auth.profile.warehouse_id,
            unitId,
            courierUserId,
            courierName: courierProfile.full_name || "Без имени",
            assignedByUserId: auth.user.id,
          })
        : shipSingleUnit(req, unitId, courierUserId),
    ),
  );

  const results: SingleAssignResult[] = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      unit_id: unitIds[index],
      ok: false,
      status: 500,
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    };
  });

  const successful = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);

  return NextResponse.json(
    {
      ok: failed.length === 0,
      partial: successful.length > 0 && failed.length > 0,
      success_count: successful.length,
      failed_count: failed.length,
      successful_unit_ids: successful.map((result) => result.unit_id),
      failed,
    },
    { status: successful.length > 0 ? 200 : 400 },
  );
}

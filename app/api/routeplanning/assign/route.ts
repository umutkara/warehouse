import { NextResponse } from "next/server";
import { requireUserProfile } from "@/app/api/_shared/user-profile";
import { supabaseServer } from "@/lib/supabase/server";
import { canEditRoutePlanning } from "@/lib/routeplanning/access";

const MAX_UNITS_PER_REQUEST = 150;

type AssignRequestBody = {
  unitIds?: unknown;
  courierUserId?: unknown;
  courierName?: unknown;
};

type SingleAssignResult = {
  unit_id: string;
  ok: boolean;
  status: number;
  error: string | null;
};

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
  courierUserId: string | null,
  courierName: string | null,
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
      ...(courierUserId ? { courierUserId } : { courierName }),
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
  const courierName = asTrimmedString(body?.courierName);

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

  if (!courierUserId && !courierName) {
    return NextResponse.json(
      { error: "courierUserId or courierName is required" },
      { status: 400 },
    );
  }

  const settled = await Promise.allSettled(
    unitIds.map((unitId) => shipSingleUnit(req, unitId, courierUserId, courierName)),
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

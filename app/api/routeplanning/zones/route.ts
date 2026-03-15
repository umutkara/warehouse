import { NextResponse } from "next/server";
import { requireUserProfile } from "@/app/api/_shared/user-profile";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import {
  canEditRoutePlanning,
  ROUTE_PLANNING_VIEW_ROLES,
} from "@/lib/routeplanning/access";

const DEFAULT_ZONE_STYLE = {
  strokeColor: "#2563eb",
  fillColor: "#60a5fa",
  fillOpacity: 0.14,
  strokeOpacity: 0.75,
  strokeWeight: 2,
} as const;

type JsonRecord = Record<string, unknown>;
type ZonePoint = { lat: number; lng: number };

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const text = asTrimmedString(value);
  if (!text) return fallback;
  const normalized = text.startsWith("#") ? text : `#${text}`;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeZoneStyle(styleInput: unknown) {
  const style =
    styleInput && typeof styleInput === "object" ? (styleInput as JsonRecord) : ({} as JsonRecord);
  return {
    strokeColor: normalizeHexColor(style.strokeColor, DEFAULT_ZONE_STYLE.strokeColor),
    fillColor: normalizeHexColor(style.fillColor, DEFAULT_ZONE_STYLE.fillColor),
    fillOpacity: clampNumber(style.fillOpacity, DEFAULT_ZONE_STYLE.fillOpacity, 0.05, 0.9),
    strokeOpacity: clampNumber(style.strokeOpacity, DEFAULT_ZONE_STYLE.strokeOpacity, 0.1, 1),
    strokeWeight: clampNumber(style.strokeWeight, DEFAULT_ZONE_STYLE.strokeWeight, 1, 8),
  };
}

function extractZoneStyle(meta: unknown) {
  if (!meta || typeof meta !== "object") return DEFAULT_ZONE_STYLE;
  const record = meta as JsonRecord;
  const display =
    record.display && typeof record.display === "object"
      ? (record.display as JsonRecord)
      : (record as JsonRecord);
  return normalizeZoneStyle(display);
}

function normalizePolygon(input: unknown): ZonePoint[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const record = point as JsonRecord;
      const lat = toFiniteNumber(record.lat);
      const lng = toFiniteNumber(record.lng);
      if (lat === null || lng === null) return null;
      return { lat, lng };
    })
    .filter((point): point is ZonePoint => point !== null);
}

function normalizeCode(rawCode: string | null, zoneName: string): string {
  const source = rawCode || zoneName;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const fallback = `zone-${Date.now().toString(36)}`;
  return slug || fallback;
}

function toZoneDto(zone: {
  id: string;
  name: string;
  code: string;
  polygon: unknown;
  priority: number;
  meta: unknown;
}) {
  return {
    id: zone.id,
    name: zone.name,
    code: zone.code,
    priority: zone.priority,
    polygon: Array.isArray(zone.polygon) ? zone.polygon : [],
    style: extractZoneStyle(zone.meta),
  };
}

async function requireRoutePlanningProfile() {
  const supabase = await supabaseServer();
  return requireUserProfile(supabase, {
    profileSelect: "warehouse_id, role",
    allowedRoles: [...ROUTE_PLANNING_VIEW_ROLES],
  });
}

export async function GET() {
  const auth = await requireRoutePlanningProfile();
  if (!auth.ok) return auth.response;

  const { data: zones, error } = await supabaseAdmin
    .from("delivery_zones")
    .select("id, name, code, polygon, priority, meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("active", true)
    .order("priority", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const normalized = (zones || []).map(toZoneDto);
  return NextResponse.json({
    ok: true,
    count: normalized.length,
    zones: normalized,
  });
}

export async function POST(req: Request) {
  const auth = await requireRoutePlanningProfile();
  if (!auth.ok) return auth.response;
  if (!canEditRoutePlanning(auth.profile.role)) {
    return NextResponse.json(
      { error: "Only logistics/admin can edit geozones" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as JsonRecord | null;
  const name = asTrimmedString(body?.name);
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const polygon = normalizePolygon(body?.polygon);
  if (polygon.length < 3) {
    return NextResponse.json(
      { error: "polygon must contain at least 3 valid points" },
      { status: 400 },
    );
  }

  const style = normalizeZoneStyle(body?.style);
  const priority = clampNumber(body?.priority, 100, 1, 1000);
  const code = normalizeCode(asTrimmedString(body?.code), name);

  const { data: insertedZone, error } = await supabaseAdmin
    .from("delivery_zones")
    .insert({
      warehouse_id: auth.profile.warehouse_id,
      name,
      code,
      polygon,
      active: true,
      priority,
      meta: { display: style },
    })
    .select("id, name, code, polygon, priority, meta")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Zone code already exists in this warehouse" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    zone: toZoneDto(insertedZone),
  });
}

export async function DELETE(req: Request) {
  const auth = await requireRoutePlanningProfile();
  if (!auth.ok) return auth.response;
  if (!canEditRoutePlanning(auth.profile.role)) {
    return NextResponse.json(
      { error: "Only logistics/admin can edit geozones" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const id = asTrimmedString(url.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("delivery_zones")
    .delete()
    .eq("id", id)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}

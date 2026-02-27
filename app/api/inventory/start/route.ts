import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const ALLOWED_CELL_TYPES = [
  "bin",
  "storage",
  "picking",
  "shipping",
  "rejected",
  "ff",
  "surplus",
] as const;
type AllowedCellType = (typeof ALLOWED_CELL_TYPES)[number];

function normalizeStringArray(value: unknown, transform?: (v: string) => string): string[] | null {
  if (!Array.isArray(value)) return null;
  const result = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .map((item) => (transform ? transform(item) : item));
  return Array.from(new Set(result));
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, warehouse_id")
      .eq("id", authData.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!profile.role || !["admin", "head", "manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);

    const cellCodes = body?.cellCodes ?? body?.cell_codes;
    const cellTypes = body?.cellTypes ?? body?.cell_types;

    if (cellCodes !== undefined && !Array.isArray(cellCodes)) {
      return NextResponse.json(
        { error: "cellCodes must be an array of strings" },
        { status: 400 },
      );
    }
    if (cellTypes !== undefined && !Array.isArray(cellTypes)) {
      return NextResponse.json(
        { error: "cellTypes must be an array of strings" },
        { status: 400 },
      );
    }

    const normalizedCodes = normalizeStringArray(cellCodes, (v) => v.toUpperCase());
    const normalizedTypes = normalizeStringArray(cellTypes, (v) => v.toLowerCase());

    if (normalizedTypes) {
      const invalidType = normalizedTypes.find(
        (type) => !ALLOWED_CELL_TYPES.includes(type as AllowedCellType),
      );
      if (invalidType) {
        return NextResponse.json(
          { error: `Unsupported cell type: ${invalidType}` },
          { status: 400 },
        );
      }
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc("inventory_start", {
      p_cell_codes: normalizedCodes && normalizedCodes.length > 0 ? normalizedCodes : null,
      p_cell_types: normalizedTypes && normalizedTypes.length > 0 ? normalizedTypes : null,
    });

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message || "Failed to start inventory" },
        { status: 400 }
      );
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to start inventory" },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}

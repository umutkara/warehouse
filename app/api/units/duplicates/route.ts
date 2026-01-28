import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type UnitRow = {
  id: string;
  barcode: string;
  status: string | null;
  cell_id: string | null;
  created_at?: string | null;
  warehouse_cells?: {
    code: string | null;
    cell_type: string | null;
  } | null;
};

type DuplicateUnit = {
  id: string;
  barcode: string;
  status: string | null;
  cell_code: string | null;
  cell_type: string | null;
};

type DuplicateGroup = {
  key: string;
  units: DuplicateUnit[];
};

function normalizeDigits(value: any): string {
  return String(value ?? "").replace(/\D/g, "");
}

function getElevenDigitKeys(digits: string): string[] {
  if (digits.length < 11) return [];
  const keys = new Set<string>();
  for (let i = 0; i <= digits.length - 11; i += 1) {
    keys.add(digits.slice(i, i + 11));
  }
  return Array.from(keys);
}

export async function GET() {
  const supabase = await supabaseServer();

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    const pageSize = 1000;
    let from = 0;
    const allUnits: UnitRow[] = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("units")
        .select(`
          id,
          barcode,
          status,
          cell_id,
          created_at,
          warehouse_cells!units_cell_id_fkey(code, cell_type)
        `)
        .eq("warehouse_id", profile.warehouse_id)
        .not("cell_id", "is", null)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const batch = (data || []) as UnitRow[];
      allUnits.push(...batch);

      if (batch.length < pageSize) break;
      from += pageSize;
    }

    const keyMap = new Map<string, { units: DuplicateUnit[]; unitIds: Set<string> }>();

    for (const unit of allUnits) {
      const digits = normalizeDigits(unit.barcode);
      const keys = getElevenDigitKeys(digits);
      if (keys.length === 0) continue;

      const item: DuplicateUnit = {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status ?? null,
        cell_code: unit.warehouse_cells?.code ?? null,
        cell_type: unit.warehouse_cells?.cell_type ?? null,
      };

      for (const key of keys) {
        const entry = keyMap.get(key);
        if (!entry) {
          keyMap.set(key, { units: [item], unitIds: new Set([unit.id]) });
          continue;
        }
        if (!entry.unitIds.has(unit.id)) {
          entry.units.push(item);
          entry.unitIds.add(unit.id);
        }
      }
    }

    const duplicates: DuplicateGroup[] = Array.from(keyMap.entries())
      .filter(([, entry]) => entry.units.length > 1)
      .map(([key, entry]) => ({ key, units: entry.units }))
      .sort((a, b) => {
        if (b.units.length !== a.units.length) return b.units.length - a.units.length;
        return a.key.localeCompare(b.key);
      });

    return NextResponse.json({
      ok: true,
      total_units: allUnits.length,
      duplicates,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

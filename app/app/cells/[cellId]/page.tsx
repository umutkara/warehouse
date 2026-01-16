import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import UnitsTable from "./UnitsTable";

async function getCell(cellId: string) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return null;
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return null;
  }

  const { data, error } = await supabase
    .from("warehouse_cells_map")
    .select("id, code, cell_type, units_count, calc_status")
    .eq("id", cellId)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function getUnitsByCell(cellId: string) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return [];
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return [];
  }

  const { data, error } = await supabase
    .from("units")
    .select("id, barcode, status, created_at")
    .eq("cell_id", cellId)
    .eq("warehouse_id", profile.warehouse_id)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return data || [];
}

export default async function CellPage({
  params,
}: {
  params: Promise<{ cellId: string }>;
}) {
  const { cellId } = await params;
  const cell = await getCell(cellId);
  const units = await getUnitsByCell(cellId);

  if (!cell) {
    notFound();
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/app/warehouse-map" style={{ color: "#0066cc", textDecoration: "none" }}>
          ← Назад к карте
        </Link>
      </div>

      <h1 style={{ margin: "0 0 20px 0" }}>
        Ячейка: {cell.code} ({cell.cell_type})
      </h1>

      <div style={{ marginBottom: 20, fontSize: 14, color: "#666" }}>
        Заказов в ячейке: {units.length}
      </div>

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Заказы в ячейке</div>

        <UnitsTable units={units} />
      </div>
    </div>
  );
}

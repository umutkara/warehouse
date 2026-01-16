import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

type ProductInfo = {
  title: string | null;
  sku: string | null;
  vendor: string | null;
  image_url: string | null;
};

async function getUnit(unitId: string) {
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
    .from("units")
    .select("id, barcode, status, cell_id, created_at")
    .eq("id", unitId)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

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
    .select("id, code, cell_type")
    .eq("id", cellId)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function getUnitItem(unitId: string) {
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

  // Verify unit belongs to user's warehouse via join
  const { data: unitData } = await supabase
    .from("units")
    .select("id, warehouse_id")
    .eq("id", unitId)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (!unitData) {
    return null;
  }

  // Get unit_item
  const { data, error } = await supabase
    .from("unit_items")
    .select("unit_id, title, sku, vendor, image_url, meta, created_at, updated_at")
    .eq("unit_id", unitId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export default async function UnitPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const unit = await getUnit(unitId);

  if (!unit) {
    notFound();
  }

  const cell = unit.cell_id ? await getCell(unit.cell_id) : null;
  const item = await getUnitItem(unitId);
  const product: ProductInfo | null = item
    ? {
        title: item.title,
        sku: item.sku,
        vendor: item.vendor,
        image_url: item.image_url,
      }
    : null;
  const moves: any[] = []; // Placeholder for future implementation

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        {unit.cell_id ? (
          <Link href={`/app/cells/${unit.cell_id}`} style={{ color: "#0066cc", textDecoration: "none" }}>
            ← Назад к ячейке
          </Link>
        ) : (
          <Link href="/app/warehouse-map" style={{ color: "#0066cc", textDecoration: "none" }}>
            ← Назад к карте
          </Link>
        )}
      </div>

      <div style={{ marginBottom: 30 }}>
        <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{unit.barcode}</div>
        <div style={{ fontSize: 14, color: "#666" }}>ID: {unit.id}</div>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Основная информация</div>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Статус</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{unit.status}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Создан</div>
              <div style={{ fontSize: 14 }}>{new Date(unit.created_at).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Текущая ячейка</div>
              {cell ? (
                <>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>
                    {cell.code} ({cell.cell_type})
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <Link
                      href={`/app/cells/${unit.cell_id}`}
                      style={{ color: "#0066cc", textDecoration: "none", fontSize: 14 }}
                    >
                      Открыть ячейку →
                    </Link>
                    <Link
                      href={`/app/warehouse-map?cellId=${cell.id}`}
                      style={{ color: "#0066cc", textDecoration: "none", fontSize: 14 }}
                    >
                      Показать на карте →
                    </Link>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: "#999" }}>Ячейка: неизвестно</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Товар</div>
          {product ? (
            <div style={{ display: "grid", gap: 12 }}>
              {product.image_url && (
                <div>
                  <img
                    src={product.image_url}
                    alt={product.title || "Товар"}
                    style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8 }}
                  />
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Название</div>
                <div style={{ fontSize: 14 }}>{product.title || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>SKU</div>
                <div style={{ fontSize: 14 }}>{product.sku || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Производитель</div>
                <div style={{ fontSize: 14 }}>{product.vendor || "—"}</div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 14 }}>
              Данные товара будут добавлены позже
            </div>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>История перемещений (скоро)</div>
          {moves.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {moves.map((move: any, index: number) => (
                <div key={index} style={{ padding: 12, background: "#f9f9f9", borderRadius: 8 }}>
                  <div style={{ fontSize: 14 }}>{move.note || "Перемещение"}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {new Date(move.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 14 }}>
              История перемещений будет доступна позже
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminFromMock } from "../../helpers/supabase-mocks";

vi.mock("../../../lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe("getOperationalPickingUnitsForWarehouse", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns empty units when no picking cells", async () => {
    const { supabaseAdmin } = await import("../../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_cells: [{ data: [], error: null }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { getOperationalPickingUnitsForWarehouse } = await import(
      "../../../lib/logistics/operational-picking-units"
    );
    const res = await getOperationalPickingUnitsForWarehouse("w1");
    expect(res).toEqual({ ok: true, units: [] });
  });

  it("returns empty units when picking cells exist but no active tasks", async () => {
    const { supabaseAdmin } = await import("../../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_cells: [
        {
          data: [{ id: "c1", code: "E1", cell_type: "picking", meta: null }],
          error: null,
        },
      ],
      picking_tasks: [{ data: [], error: null }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { getOperationalPickingUnitsForWarehouse } = await import(
      "../../../lib/logistics/operational-picking-units"
    );
    const res = await getOperationalPickingUnitsForWarehouse("w1");
    expect(res).toEqual({ ok: true, units: [] });
  });

  it("excludes units with outbound shipment status out", async () => {
    const { supabaseAdmin } = await import("../../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_cells: [
        {
          data: [{ id: "c1", code: "E1", cell_type: "picking", meta: null }],
          error: null,
        },
      ],
      picking_tasks: [
        {
          data: [
            {
              id: "t1",
              scenario: "S",
              status: "open",
              created_at: "2026-01-15T10:00:00.000Z",
              target_picking_cell_id: "c1",
            },
          ],
          error: null,
        },
      ],
      picking_task_units: [{ data: [{ unit_id: "u1", picking_task_id: "t1" }], error: null }],
      units: [
        {
          data: [
            {
              id: "u1",
              barcode: "111",
              status: "receiving",
              cell_id: null,
              created_at: "2026-01-10T10:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      outbound_shipments: [{ data: [{ unit_id: "u1" }], error: null }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { getOperationalPickingUnitsForWarehouse } = await import(
      "../../../lib/logistics/operational-picking-units"
    );
    const res = await getOperationalPickingUnitsForWarehouse("w1");
    expect(res).toEqual({ ok: true, units: [] });
  });

  it("returns enriched unit with task target cell and scenario", async () => {
    const { supabaseAdmin } = await import("../../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_cells: [
        {
          data: [{ id: "c1", code: "E1", cell_type: "picking", meta: { description: "East" } }],
          error: null,
        },
      ],
      picking_tasks: [
        {
          data: [
            {
              id: "t1",
              scenario: "Return line",
              status: "open",
              created_at: "2026-01-15T10:00:00.000Z",
              target_picking_cell_id: "c1",
            },
          ],
          error: null,
        },
        { data: [], error: null },
        {
          data: [
            {
              id: "t1",
              scenario: "Return line",
              status: "open",
              created_at: "2026-01-15T10:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      picking_task_units: [
        { data: [{ unit_id: "u1", picking_task_id: "t1" }], error: null },
        { data: [{ unit_id: "u1", picking_task_id: "t1" }], error: null },
      ],
      units: [
        {
          data: [
            {
              id: "u1",
              barcode: "003100",
              status: "receiving",
              cell_id: null,
              created_at: "2026-01-10T10:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      outbound_shipments: [{ data: [], error: null }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { getOperationalPickingUnitsForWarehouse } = await import(
      "../../../lib/logistics/operational-picking-units"
    );
    const res = await getOperationalPickingUnitsForWarehouse("w1");
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.units).toHaveLength(1);
    expect(res.units[0]).toMatchObject({
      id: "u1",
      barcode: "003100",
      cell_id: "c1",
      scenario: "Return line",
      cell: expect.objectContaining({
        id: "c1",
        code: "E1",
        cell_type: "picking",
      }),
    });
  });

  it("propagates warehouse_cells error", async () => {
    const { supabaseAdmin } = await import("../../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_cells: [{ data: null, error: { message: "cells down" } }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { getOperationalPickingUnitsForWarehouse } = await import(
      "../../../lib/logistics/operational-picking-units"
    );
    const res = await getOperationalPickingUnitsForWarehouse("w1");
    expect(res).toEqual({ ok: false, error: "cells down" });
  });
});

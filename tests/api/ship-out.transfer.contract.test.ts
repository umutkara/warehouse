import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminFromMock } from "../helpers/supabase-mocks";
import { callShipOut } from "../helpers/api-callers";
import { mockServerWithProfile } from "../helpers/server-auth";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe("POST /api/logistics/ship-out transfer branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates hub transfer when shipped from hub picking cell and no existing transfer", async () => {
    const supabaseRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: true, shipment_id: "s1", unit_barcode: "BC-1" },
        error: null,
      })
      .mockResolvedValue({ data: { ok: true }, error: null });

    mockServerWithProfile({
      supabaseServerMock,
      role: "logistics",
      userId: "user-1",
      rpc: supabaseRpc,
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      picking_task_units: [
        { data: [{ picking_task_id: "t1" }], error: null },
        { data: [], error: null },
      ],
      picking_tasks: [
        { data: { scenario: "merchant", warehouse_id: "w1", target_picking_cell_id: "cell-hub" }, error: null },
        { data: [], error: null },
      ],
      units: [
        { data: { id: "u1", barcode: "BC-1", meta: {} }, error: null },
        { data: null, error: null },
      ],
      warehouse_cells: [
        { data: { id: "cell-hub", code: "shirvanhub-1", warehouse_id: "w1" }, error: null },
      ],
      transfers: [
        { data: null, error: null },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const res = await callShipOut({ unitId: "u1", courierName: "Courier" });

    expect(res.status).toBe(200);
    expect(adminMock.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "transfers",
          payload: expect.objectContaining({
            unit_id: "u1",
            from_warehouse_id: "w1",
            to_warehouse_id: "b48c495b-62db-42f5-8968-07e4fab80a82",
            status: "in_transit",
          }),
        }),
      ]),
    );
  });

  it("creates explicit transfer when transferToWarehouseId is provided and no existing transfer", async () => {
    const supabaseRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: true, shipment_id: "s1", unit_barcode: "BC-1" },
        error: null,
      })
      .mockResolvedValue({ data: { ok: true }, error: null });

    mockServerWithProfile({
      supabaseServerMock,
      role: "logistics",
      userId: "user-1",
      rpc: supabaseRpc,
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      picking_task_units: [
        { data: [], error: null },
        { data: [], error: null },
      ],
      picking_tasks: [
        { data: null, error: null },
        { data: [], error: null },
      ],
      units: [
        { data: { id: "u1", barcode: "BC-1", meta: {} }, error: null },
        { data: null, error: null },
      ],
      transfers: [
        { data: null, error: null },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const res = await callShipOut({
      unitId: "u1",
      courierName: "Courier",
      transferToWarehouseId: "w2",
    });

    expect(res.status).toBe(200);
    expect(adminMock.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "transfers",
          payload: expect.objectContaining({
            unit_id: "u1",
            from_warehouse_id: "w1",
            to_warehouse_id: "w2",
            status: "in_transit",
            meta: expect.objectContaining({ note: "explicit_transfer" }),
          }),
        }),
      ]),
    );
  });
});

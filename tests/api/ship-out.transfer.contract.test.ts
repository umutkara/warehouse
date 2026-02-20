import { beforeEach, describe, expect, it, vi } from "vitest";

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

function createQueryChain(finalResult: unknown) {
  const chain: Record<string, any> = {};
  if (finalResult && typeof finalResult === "object") {
    chain.data = (finalResult as any).data ?? null;
    chain.error = (finalResult as any).error ?? null;
  } else {
    chain.data = null;
    chain.error = null;
  }
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(async () => finalResult);
  chain.maybeSingle = vi.fn(async () => finalResult);
  return chain;
}

function createAdminFromMock(plans: Record<string, Array<{ data: any; error: any }>>) {
  const inserts: Array<{ table: string; payload: any }> = [];
  const counters: Record<string, number> = {};

  const from = vi.fn((table: string) => {
    counters[table] = counters[table] ?? 0;
    const idx = counters[table]++;
    const plan = plans[table]?.[idx] ?? { data: null, error: null };
    const chain: Record<string, any> = {
      data: plan.data,
      error: plan.error,
    };
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.single = vi.fn(async () => plan);
    chain.maybeSingle = vi.fn(async () => plan);
    chain.update = vi.fn(() => chain);
    chain.insert = vi.fn((payload: any) => {
      inserts.push({ table, payload });
      return chain;
    });
    return chain;
  });

  return { from, inserts };
}

describe("POST /api/logistics/ship-out transfer branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates hub transfer when shipped from hub picking cell and no existing transfer", async () => {
    const profileChain = createQueryChain({
      data: { warehouse_id: "w1", role: "logistics" },
      error: null,
    });

    const supabaseRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: true, shipment_id: "s1", unit_barcode: "BC-1" },
        error: null,
      })
      .mockResolvedValue({ data: { ok: true }, error: null });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: vi.fn(() => profileChain),
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

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({ unitId: "u1", courierName: "Courier" }),
      }),
    );

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
    const profileChain = createQueryChain({
      data: { warehouse_id: "w1", role: "logistics" },
      error: null,
    });

    const supabaseRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: true, shipment_id: "s1", unit_barcode: "BC-1" },
        error: null,
      })
      .mockResolvedValue({ data: { ok: true }, error: null });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: vi.fn(() => profileChain),
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

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({
          unitId: "u1",
          courierName: "Courier",
          transferToWarehouseId: "w2",
        }),
      }),
    );

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

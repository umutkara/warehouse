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
  const tableCalls: string[] = [];
  const updates: Array<{ table: string; payload: any }> = [];
  const inserts: Array<{ table: string; payload: any }> = [];
  const counters: Record<string, number> = {};

  const from = vi.fn((table: string) => {
    tableCalls.push(table);
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
    chain.update = vi.fn((payload: any) => {
      updates.push({ table, payload });
      return chain;
    });
    chain.insert = vi.fn((payload: any) => {
      inserts.push({ table, payload });
      return chain;
    });

    return chain;
  });

  return { from, tableCalls, updates, inserts };
}

describe("POST /api/logistics/ship-out contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized user", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({ unitId: "u1", courierName: "Courier" }),
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("returns 403 for unsupported role", async () => {
    const profileChain = createQueryChain({
      data: { warehouse_id: "w1", role: "ops" },
      error: null,
    });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: vi.fn(() => profileChain),
    });

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({ unitId: "u1", courierName: "Courier" }),
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  it("returns 400 when required body fields are missing", async () => {
    const profileChain = createQueryChain({
      data: { warehouse_id: "w1", role: "logistics" },
      error: null,
    });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: vi.fn(() => profileChain),
    });

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({ unitId: "u1" }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "unitId and courierName are required",
    });
  });

  it("returns 500 when ship_unit_out RPC fails", async () => {
    const profileChain = createQueryChain({
      data: { warehouse_id: "w1", role: "logistics" },
      error: null,
    });

    const supabaseRpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "rpc failed" } });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: vi.fn(() => profileChain),
      rpc: supabaseRpc,
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    vi.mocked(supabaseAdmin.from).mockImplementation(() => createQueryChain({ data: [], error: null }) as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({ unitId: "u1", courierName: "Courier" }),
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "rpc failed" });
  });

  it("uses admin RPC fallback for hub_worker when primary RPC returns Forbidden", async () => {
    const profileChain = createQueryChain({
      data: { warehouse_id: "w1", role: "hub_worker" },
      error: null,
    });

    const supabaseRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: false, error: "Forbidden: requires elevated privileges" },
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
    vi.mocked(supabaseAdmin.from).mockImplementation(() => createQueryChain({ data: [], error: null }) as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: { ok: true, shipment_id: "s-admin", unit_barcode: "BC-HUB" },
      error: null,
    } as any);

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({ unitId: "u-hub", courierName: "Hub Courier" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      shipment: expect.objectContaining({ shipment_id: "s-admin", unit_barcode: "BC-HUB" }),
    });

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "ship_unit_out",
      expect.objectContaining({
        p_unit_id: "u-hub",
        p_courier_name: "Hub Courier",
      }),
    );
  });

  it("returns 500 when hub_worker fallback admin RPC fails", async () => {
    const profileChain = createQueryChain({
      data: { warehouse_id: "w1", role: "hub_worker" },
      error: null,
    });

    const supabaseRpc = vi.fn().mockResolvedValueOnce({
      data: { ok: false, error: "Forbidden: requires elevated privileges" },
      error: null,
    });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: vi.fn(() => profileChain),
      rpc: supabaseRpc,
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    vi.mocked(supabaseAdmin.from).mockImplementation(() => createQueryChain({ data: [], error: null }) as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: null,
      error: { message: "admin rpc failed" },
    } as any);

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({ unitId: "u-hub", courierName: "Hub Courier" }),
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "admin rpc failed" });
  });

  it("returns shipment on success and writes final audit event", async () => {
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
    vi.mocked(supabaseAdmin.from).mockImplementation(() => createQueryChain({ data: [], error: null }) as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const { POST } = await import("../../app/api/logistics/ship-out/route");
    const res = await POST(
      new Request("http://localhost/api/logistics/ship-out", {
        method: "POST",
        body: JSON.stringify({ unitId: "u1", courierName: "Courier" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      shipment: { ok: true, shipment_id: "s1", unit_barcode: "BC-1" },
    });

    expect(supabaseRpc).toHaveBeenCalledWith(
      "audit_log_event",
      expect.objectContaining({
        p_action: "logistics.ship_out",
        p_entity_type: "unit",
        p_entity_id: "u1",
      }),
    );
  });

  it("completes picking task, updates ops meta and skips duplicate transfer", async () => {
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
        { data: [{ picking_task_id: "t1" }], error: null },
      ],
      picking_tasks: [
        { data: { scenario: "merchant", warehouse_id: "w1", target_picking_cell_id: "cell-hub" }, error: null },
        { data: [], error: null },
        { data: [{ id: "t1", status: "open", warehouse_id: "w1" }], error: null },
        { data: null, error: null },
      ],
      units: [
        { data: { id: "u1", barcode: "BC-1", meta: {} }, error: null },
        { data: null, error: null },
      ],
      warehouse_cells: [
        { data: { id: "cell-hub", code: "shirvanhub-1", warehouse_id: "w1" }, error: null },
      ],
      transfers: [
        { data: { id: "existing-transfer" }, error: null },
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

    expect(adminMock.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "picking_tasks",
          payload: expect.objectContaining({ status: "done", completed_by: "user-1" }),
        }),
        expect.objectContaining({
          table: "units",
          payload: expect.objectContaining({
            meta: expect.objectContaining({ ops_status: "in_progress" }),
          }),
        }),
      ]),
    );

    expect(adminMock.inserts.filter((x) => x.table === "transfers")).toHaveLength(0);
    expect(supabaseRpc).toHaveBeenCalledWith(
      "audit_log_event",
      expect.objectContaining({ p_action: "picking_task_complete" }),
    );
    expect(supabaseRpc).toHaveBeenCalledWith(
      "audit_log_event",
      expect.objectContaining({ p_action: "ops.unit_status_update" }),
    );
    expect(supabaseRpc).toHaveBeenCalledWith(
      "audit_log_event",
      expect.objectContaining({ p_action: "logistics.ship_out" }),
    );
  });
});

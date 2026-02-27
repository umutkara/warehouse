import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

function makeChain(result: { data: any; error: any }) {
  const chain: any = { data: result.data, error: result.error };
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("GET /api/tsd/inventory-tasks/list contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized user", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const { GET } = await import("../../app/api/tsd/inventory-tasks/list/route");
    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Не авторизован" });
  });

  it("returns 409 when inventory is inactive", async () => {
    const fromMock = vi.fn().mockReturnValue(
      makeChain({
        data: { warehouse_id: "w1" },
        error: null,
      }),
    );
    const rpcMock = vi.fn().mockResolvedValueOnce({
      data: { ok: true, active: false, sessionId: null },
      error: null,
    });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      },
      from: fromMock,
      rpc: rpcMock,
    });

    const { GET } = await import("../../app/api/tsd/inventory-tasks/list/route");
    const res = await GET();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "Инвентаризация не активна" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("inventory_status");
  });

  it("maps both camelCase and snake_case fields from inventory_get_tasks", async () => {
    const fromMock = vi.fn().mockReturnValue(
      makeChain({
        data: { warehouse_id: "w1" },
        error: null,
      }),
    );
    const rpcMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: true, active: true, sessionId: "sess-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          tasks: [
            {
              id: "t1",
              cellId: "c1",
              cellCode: "A1",
              cellType: "storage",
              status: "pending",
              scannedBy: "u1",
            },
            {
              id: "t2",
              cell_id: "c2",
              cell_code: "B2",
              cell_type: "shipping",
              status: "pending",
              scanned_by: "u2",
            },
          ],
        },
        error: null,
      });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      },
      from: fromMock,
      rpc: rpcMock,
    });

    const { GET } = await import("../../app/api/tsd/inventory-tasks/list/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).toMatchObject({
      ok: true,
      sessionId: "sess-1",
    });
    expect(json.tasks).toEqual([
      {
        id: "t1",
        cellId: "c1",
        cellCode: "A1",
        cellType: "storage",
        status: "pending",
        isLockedByMe: true,
      },
      {
        id: "t2",
        cellId: "c2",
        cellCode: "B2",
        cellType: "shipping",
        status: "pending",
        isLockedByMe: false,
      },
    ]);

    expect(rpcMock).toHaveBeenNthCalledWith(1, "inventory_status");
    expect(rpcMock).toHaveBeenNthCalledWith(2, "inventory_get_tasks", {
      p_session_id: "sess-1",
    });
  });
});

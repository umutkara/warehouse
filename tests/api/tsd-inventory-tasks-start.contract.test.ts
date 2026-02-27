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
  chain.update = vi.fn(() => chain);
  return chain;
}

describe("POST /api/tsd/inventory-tasks/start contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized user", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const { POST } = await import("../../app/api/tsd/inventory-tasks/start/route");
    const res = await POST(
      new Request("http://localhost/api/tsd/inventory-tasks/start", {
        method: "POST",
        body: JSON.stringify({ taskId: "t1" }),
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Не авторизован" });
  });

  it("starts task from RPC payload and returns normalized cell fields", async () => {
    const profileChain = makeChain({ data: { warehouse_id: "w1" }, error: null });
    const lockChain = makeChain({ data: null, error: null });
    const fromMock = vi.fn().mockReturnValueOnce(profileChain).mockReturnValueOnce(lockChain);

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
              id: "task-1",
              status: "pending",
              scannedBy: "u1",
              cellId: "cell-1",
              cellCode: "A1",
              cellType: "storage",
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

    const { POST } = await import("../../app/api/tsd/inventory-tasks/start/route");
    const res = await POST(
      new Request("http://localhost/api/tsd/inventory-tasks/start", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-1" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      taskId: "task-1",
      cellId: "cell-1",
      cellCode: "A1",
      cellType: "storage",
    });

    expect(rpcMock).toHaveBeenNthCalledWith(1, "inventory_status");
    expect(rpcMock).toHaveBeenNthCalledWith(2, "inventory_get_tasks", {
      p_session_id: "sess-1",
    });
    expect(fromMock).toHaveBeenNthCalledWith(1, "profiles");
    expect(fromMock).toHaveBeenNthCalledWith(2, "inventory_cell_counts");
  });

  it("returns 404 when task is absent in inventory_get_tasks", async () => {
    const fromMock = vi.fn().mockReturnValue(
      makeChain({ data: { warehouse_id: "w1" }, error: null }),
    );
    const rpcMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: true, active: true, sessionId: "sess-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, tasks: [] },
        error: null,
      });

    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      },
      from: fromMock,
      rpc: rpcMock,
    });

    const { POST } = await import("../../app/api/tsd/inventory-tasks/start/route");
    const res = await POST(
      new Request("http://localhost/api/tsd/inventory-tasks/start", {
        method: "POST",
        body: JSON.stringify({ taskId: "missing-task" }),
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Задание не найдено" });
  });

  it("returns 409 when task is locked by another worker", async () => {
    const profileChain = makeChain({ data: { warehouse_id: "w1" }, error: null });
    const lockedByChain = makeChain({
      data: { role: "worker", full_name: "Other Worker" },
      error: null,
    });
    const fromMock = vi.fn().mockReturnValueOnce(profileChain).mockReturnValueOnce(lockedByChain);

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
              id: "task-2",
              status: "pending",
              scanned_by: "u2",
              cell_id: "cell-2",
              cell_code: "B2",
              cell_type: "shipping",
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

    const { POST } = await import("../../app/api/tsd/inventory-tasks/start/route");
    const res = await POST(
      new Request("http://localhost/api/tsd/inventory-tasks/start", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-2" }),
      }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Задание уже взято другим складчиком"),
    });
  });
});

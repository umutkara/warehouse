import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminFromMock, createQueryChain } from "../helpers/supabase-mocks";

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

describe("POST /api/picking-tasks/[id]/cancel contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function mockServerRole(role: "ops" | "admin" | "logistics", userId = "u1") {
    const profileChain = createQueryChain({
      data: { warehouse_id: "w1", role },
      error: null,
    });
    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
      from: vi.fn(() => profileChain),
    });
  }

  async function callCancel(taskId = "t1") {
    const { POST } = await import("../../app/api/picking-tasks/[id]/cancel/route");
    return POST(
      new Request(`http://localhost/api/picking-tasks/${taskId}/cancel`, { method: "POST" }),
      { params: Promise.resolve({ id: taskId }) },
    );
  }

  it("returns 401 for unauthorized user", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const res = await callCancel("t1");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("returns 403 for unsupported role", async () => {
    mockServerRole("logistics");
    const res = await callCancel("t1");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "Only OPS and Admin can cancel tasks",
    });
  });

  it("returns 400 when task already done", async () => {
    mockServerRole("ops");

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      picking_tasks: [{ data: { id: "t1", status: "done", warehouse_id: "w1" }, error: null }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const res = await callCancel("t1");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Cannot cancel completed or already canceled task",
    });
  });

  it("cancels task, returns units and writes audit event", async () => {
    mockServerRole("ops");

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      picking_tasks: [
        { data: { id: "t1", status: "open", target_picking_cell_id: "pick-1", warehouse_id: "w1" }, error: null },
        { data: null, error: null },
      ],
      picking_task_units: [
        {
          data: [
            { unit_id: "u-a", from_cell_id: "cell-a" },
            { unit_id: "u-b", from_cell_id: "cell-b" },
          ],
          error: null,
        },
      ],
      units: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      unit_moves: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const res = await callCancel("t1");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      message: "Task canceled successfully",
      units_returned: 2,
    });

    expect(adminMock.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "units", payload: { cell_id: "cell-a" } }),
        expect.objectContaining({ table: "units", payload: { cell_id: "cell-b" } }),
        expect.objectContaining({ table: "picking_tasks", payload: { status: "canceled" } }),
      ]),
    );

    expect(adminMock.inserts.filter((x) => x.table === "unit_moves")).toHaveLength(2);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      "audit_log_event",
      expect.objectContaining({
        p_event_type: "picking_task_canceled",
        p_table_name: "picking_tasks",
        p_record_id: "t1",
      }),
    );
  });

  it("keeps cancel flow running when one unit move fails", async () => {
    mockServerRole("ops");

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      picking_tasks: [
        { data: { id: "t1", status: "open", target_picking_cell_id: "pick-1", warehouse_id: "w1" }, error: null },
        { data: null, error: null },
      ],
      picking_task_units: [
        {
          data: [
            { unit_id: "u-a", from_cell_id: "cell-a" },
            { unit_id: "u-b", from_cell_id: "cell-b" },
          ],
          error: null,
        },
      ],
      units: [
        { data: null, error: { message: "update failed for u-a" } },
        { data: null, error: null },
      ],
      unit_moves: [
        { data: null, error: null },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const res = await callCancel("t1");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      message: "Task canceled successfully",
      units_returned: 2,
    });

    // Both units were attempted, but only one successful move was logged.
    expect(adminMock.updates.filter((x) => x.table === "units")).toHaveLength(2);
    expect(adminMock.inserts.filter((x) => x.table === "unit_moves")).toHaveLength(1);
    expect(adminMock.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "picking_tasks", payload: { status: "canceled" } }),
      ]),
    );
  });
});

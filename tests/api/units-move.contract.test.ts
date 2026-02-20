import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

describe("POST /api/units/move contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized user", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const { POST } = await import("../../app/api/units/move/route");
    const res = await POST(
      new Request("http://localhost/api/units/move", {
        method: "POST",
        body: JSON.stringify({ unitId: "u1", toCellId: "c1" }),
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("returns 400 for invalid toStatus", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
    });

    const { POST } = await import("../../app/api/units/move/route");
    const res = await POST(
      new Request("http://localhost/api/units/move", {
        method: "POST",
        body: JSON.stringify({ unitId: "unit-1", toCellId: "cell-1", toStatus: "bad_status" }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid toStatus"),
      provided: "bad_status",
    });
  });

  it("maps INVENTORY_ACTIVE RPC error to 423", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "INVENTORY_ACTIVE" },
      }),
    });

    const { POST } = await import("../../app/api/units/move/route");
    const res = await POST(
      new Request("http://localhost/api/units/move", {
        method: "POST",
        body: JSON.stringify({ unitId: "unit-1", toCellId: "cell-1", toStatus: "stored" }),
      }),
    );

    expect(res.status).toBe(423);
    await expect(res.json()).resolves.toMatchObject({
      error: "Инвентаризация активна. Перемещения заблокированы.",
    });
  });

  it("returns 200 and normalized payload on success", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        unitId: "unit-1",
        fromCellId: "cell-a",
        toCellId: "cell-b",
        toStatus: "stored",
      },
      error: null,
    });
    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
      rpc: rpcMock,
    });

    const { POST } = await import("../../app/api/units/move/route");
    const res = await POST(
      new Request("http://localhost/api/units/move", {
        method: "POST",
        body: JSON.stringify({ unitId: "unit-1", toCellId: "cell-b", toStatus: "stored" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      unitId: "unit-1",
      fromCellId: "cell-a",
      toCellId: "cell-b",
      toStatus: "stored",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "move_unit_to_cell",
      expect.objectContaining({
        p_unit_id: "unit-1",
        p_to_cell_id: "cell-b",
        p_to_status: "stored",
        p_source: "move",
      }),
    );
  });

  it("maps not found move result to 404", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
      rpc: vi.fn().mockResolvedValue({
        data: { ok: false, error: "Target cell not found" },
        error: null,
      }),
    });

    const { POST } = await import("../../app/api/units/move/route");
    const res = await POST(
      new Request("http://localhost/api/units/move", {
        method: "POST",
        body: JSON.stringify({ unitId: "unit-1", toCellId: "cell-missing", toStatus: "stored" }),
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Target cell not found" });
  });

  it("maps warehouse boundary error to 403", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
      rpc: vi.fn().mockResolvedValue({
        data: { ok: false, error: "Unit belongs to different warehouse" },
        error: null,
      }),
    });

    const { POST } = await import("../../app/api/units/move/route");
    const res = await POST(
      new Request("http://localhost/api/units/move", {
        method: "POST",
        body: JSON.stringify({ unitId: "unit-1", toCellId: "cell-1", toStatus: "stored" }),
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "Unit belongs to different warehouse",
    });
  });

  it("maps blocked or inactive target cell error to 400", async () => {
    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }) },
      rpc: vi.fn().mockResolvedValue({
        data: { ok: false, error: "Target cell is blocked" },
        error: null,
      }),
    });

    const { POST } = await import("../../app/api/units/move/route");
    const res = await POST(
      new Request("http://localhost/api/units/move", {
        method: "POST",
        body: JSON.stringify({ unitId: "unit-1", toCellId: "cell-1", toStatus: "stored" }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Target cell is blocked" });
  });
});

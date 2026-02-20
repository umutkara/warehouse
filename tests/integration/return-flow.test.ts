import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

describe("Return flow out -> bin (integration-style contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves a shipped unit back to bin and returns normalized payload", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        unitId: "unit-out-1",
        fromCellId: "out-cell",
        toCellId: "bin-cell",
        toStatus: "bin",
      },
      error: null,
    });

    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "operator-1" } } }) },
      rpc: rpcMock,
    });

    const { POST } = await import("../../app/api/units/move/route");
    const res = await POST(
      new Request("http://localhost/api/units/move", {
        method: "POST",
        body: JSON.stringify({
          unitId: "unit-out-1",
          toCellId: "bin-cell",
          toStatus: "bin",
        }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      unitId: "unit-out-1",
      fromCellId: "out-cell",
      toCellId: "bin-cell",
      toStatus: "bin",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "move_unit_to_cell",
      expect.objectContaining({
        p_unit_id: "unit-out-1",
        p_to_cell_id: "bin-cell",
        p_to_status: "bin",
      }),
    );
  });
});

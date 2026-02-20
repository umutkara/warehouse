import { beforeEach, describe, expect, it, vi } from "vitest";
import { callUnitsMove } from "../helpers/api-callers";
import { mockServerAuthOnly } from "../helpers/server-auth";

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
    mockServerAuthOnly({ supabaseServerMock, userId: "operator-1", rpc: rpcMock });
    const res = await callUnitsMove({
      unitId: "unit-out-1",
      toCellId: "bin-cell",
      toStatus: "bin",
    });

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

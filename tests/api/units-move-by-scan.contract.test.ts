import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

function makeSingleQuery(singleResult: any) {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue(singleResult);
  return query;
}

describe("POST /api/units/move-by-scan contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for rejected -> bin move (BIN ingress policy)", async () => {
    const fromMock = vi
      .fn()
      .mockReturnValueOnce(
        makeSingleQuery({
          data: { warehouse_id: "w1", full_name: "Operator" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeSingleQuery({
          data: {
            id: "unit-1",
            barcode: "123456",
            cell_id: "cell-rej",
            warehouse_id: "w1",
            status: "rejected",
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeSingleQuery({
          data: {
            id: "cell-rej",
            code: "REJ-01",
            cell_type: "rejected",
            warehouse_id: "w1",
            meta: null,
            is_active: true,
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeSingleQuery({
          data: {
            id: "cell-bin",
            code: "BIN-01",
            cell_type: "bin",
            warehouse_id: "w1",
            meta: null,
            is_active: true,
          },
          error: null,
        }),
      );

    const rpcMock = vi.fn();
    supabaseServerMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: fromMock,
      rpc: rpcMock,
    });

    const { POST } = await import("../../app/api/units/move-by-scan/route");
    const res = await POST(
      new Request("http://localhost/api/units/move-by-scan", {
        method: "POST",
        body: JSON.stringify({
          unitBarcode: "123456",
          fromCellCode: "REJ-01",
          toCellCode: "BIN-01",
        }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Запрещено перемещать в BIN"),
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

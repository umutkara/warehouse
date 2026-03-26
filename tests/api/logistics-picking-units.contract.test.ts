import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryChain } from "../helpers/supabase-mocks";
import { callLogisticsPickingUnits } from "../helpers/api-callers";
import { mockServerUnauthorized, mockServerWithProfile } from "../helpers/server-auth";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

const getOperationalMock = vi.fn();

vi.mock("../../lib/logistics/operational-picking-units", () => ({
  getOperationalPickingUnitsForWarehouse: (...args: unknown[]) => getOperationalMock(...args),
}));

describe("GET /api/logistics/picking-units contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthorized", async () => {
    mockServerUnauthorized(supabaseServerMock);
    const res = await callLogisticsPickingUnits();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" });
    expect(getOperationalMock).not.toHaveBeenCalled();
  });

  it("returns 400 when warehouse not assigned", async () => {
    const noWarehouseChain = createQueryChain({
      data: { warehouse_id: null, role: "logistics" },
      error: null,
    });
    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: vi.fn(() => noWarehouseChain),
    });
    const res = await callLogisticsPickingUnits();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Warehouse not assigned" });
    expect(getOperationalMock).not.toHaveBeenCalled();
  });

  it("returns 403 for unsupported role", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "courier", userId: "user-1" });
    const res = await callLogisticsPickingUnits();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" });
    expect(getOperationalMock).not.toHaveBeenCalled();
  });

  it("returns 200 and units from operational helper for logistics role", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "logistics", userId: "user-1", warehouseId: "w1" });
    getOperationalMock.mockResolvedValue({
      ok: true,
      units: [
        {
          id: "u1",
          barcode: "123",
          status: "receiving",
          cell_id: "c1",
          created_at: "2026-01-01T00:00:00.000Z",
          scenario: "Scenario A",
          cell: { id: "c1", code: "E1", cell_type: "picking", meta: null },
        },
      ],
    });

    const res = await callLogisticsPickingUnits();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      units: [
        expect.objectContaining({
          id: "u1",
          barcode: "123",
          cell_id: "c1",
          scenario: "Scenario A",
          cell: expect.objectContaining({ code: "E1" }),
        }),
      ],
    });
    expect(getOperationalMock).toHaveBeenCalledWith("w1");
  });

  it("returns 400 when operational helper reports error", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "admin", userId: "user-1", warehouseId: "w1" });
    getOperationalMock.mockResolvedValue({ ok: false, error: "db exploded" });

    const res = await callLogisticsPickingUnits();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "db exploded" });
  });

  it("allows hub_worker role", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "hub_worker", userId: "user-1", warehouseId: "w1" });
    getOperationalMock.mockResolvedValue({ ok: true, units: [] });

    const res = await callLogisticsPickingUnits();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, units: [] });
  });
});

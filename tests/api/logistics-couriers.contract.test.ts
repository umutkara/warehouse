import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminFromMock } from "../helpers/supabase-mocks";
import { callLogisticsCouriers } from "../helpers/api-callers";
import { mockServerUnauthorized, mockServerWithProfile } from "../helpers/server-auth";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe("GET /api/logistics/couriers contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthorized", async () => {
    mockServerUnauthorized(supabaseServerMock);
    const res = await callLogisticsCouriers();
    expect(res.status).toBe(401);
  });

  it("returns 403 for unsupported role", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "worker", userId: "user-1" });
    const res = await callLogisticsCouriers();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  it("returns 200 with couriers mapped for logistics", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "logistics", userId: "user-1", warehouseId: "w1" });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      profiles: [
        {
          data: [
            { id: "c1", full_name: "Courier One", role: "courier" },
            { id: "c2", full_name: null, role: "courier" },
          ],
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const res = await callLogisticsCouriers();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      couriers: [
        { id: "c1", full_name: "Courier One", role: "courier" },
        { id: "c2", full_name: "Без имени", role: "courier" },
      ],
    });
  });

  it("returns 500 when admin query fails", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "logistics", userId: "user-1", warehouseId: "w1" });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      profiles: [{ data: null, error: { message: "rls" } }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const res = await callLogisticsCouriers();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "rls" });
  });
});

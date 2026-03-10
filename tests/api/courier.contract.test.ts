import { beforeEach, describe, expect, it, vi } from "vitest";
import { callCourierShiftStart, callCourierTaskClaim } from "../helpers/api-callers";
import { createAdminFromMock, createQueryChain } from "../helpers/supabase-mocks";
import { mockServerUnauthorized, mockServerAuthOnly } from "../helpers/server-auth";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

describe("Courier API contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("POST /api/courier/shift/start returns 401 when unauthorized", async () => {
    mockServerUnauthorized(supabaseServerMock);
    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    vi.mocked(supabaseAdmin.from).mockImplementation(() => createQueryChain({ data: null, error: null }) as any);

    const res = await callCourierShiftStart();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("POST /api/courier/shift/start is idempotent when shift already open", async () => {
    mockServerAuthOnly({ supabaseServerMock, userId: "courier-1" });
    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      profiles: [{ data: { warehouse_id: "w1", role: "courier", full_name: "Courier One" }, error: null }],
      courier_shifts: [
        { data: { id: "s1", status: "open", started_at: "2026-01-01T10:00:00.000Z" }, error: null },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const res = await callCourierShiftStart();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      already_open: true,
      shift: expect.objectContaining({ id: "s1", status: "open" }),
    });
  });

  it("POST /api/courier/tasks/claim returns 409 when task unavailable", async () => {
    mockServerAuthOnly({ supabaseServerMock, userId: "courier-1" });
    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      profiles: [{ data: { warehouse_id: "w1", role: "courier", full_name: "Courier One" }, error: null }],
      courier_task_pool: [{ data: null, error: null }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const res = await callCourierTaskClaim({ poolId: "pool-1" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Task already claimed or unavailable",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  callCourierShiftStart,
  callCourierTaskClaim,
  callCourierTasksScanClaim,
} from "../helpers/api-callers";
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
    const nowIso = new Date().toISOString();
    const adminMock = createAdminFromMock({
      profiles: [{ data: { warehouse_id: "w1", role: "courier", full_name: "Courier One" }, error: null }],
      // 1) stale-day check in shift/start, 2) existing open shift in shift/start
      courier_shifts: [
        {
          data: {
            id: "s1",
            status: "open",
            started_at: nowIso,
            courier_user_id: "courier-1",
            warehouse_id: "w1",
          },
          error: null,
        },
        { data: { id: "s1", status: "open", started_at: nowIso }, error: null },
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

  it("POST /api/courier/tasks/claim returns 410 because pool flow is disabled", async () => {
    mockServerAuthOnly({ supabaseServerMock, userId: "courier-1" });
    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      profiles: [{ data: { warehouse_id: "w1", role: "courier", full_name: "Courier One" }, error: null }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const res = await callCourierTaskClaim({ poolId: "pool-1" });

    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toMatchObject({
      error: "Pool claim flow is disabled. Use assignments confirm or scan-claim.",
    });
  });

  it("POST /api/courier/tasks/scan-claim succeeds without giver_signature (new external unit)", async () => {
    mockServerAuthOnly({ supabaseServerMock, userId: "courier-1" });
    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      profiles: [
        {
          data: { warehouse_id: "w1", role: "courier", full_name: "Courier One" },
          error: null,
        },
      ],
      units: [
        { data: null, error: null },
        {
          data: { id: "unit-new", barcode: "EXT-001", status: "out" },
          error: null,
        },
      ],
      outbound_shipments: [{ data: null, error: null }, { data: null, error: null }],
      courier_tasks: [
        { data: null, error: null },
        { data: { id: "task-scan-1" }, error: null },
      ],
      courier_shifts: [{ data: { id: "shift-1" }, error: null }],
      courier_task_events: [{ data: null, error: null }],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const res = await callCourierTasksScanClaim({ barcode: "EXT-001" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      task_id: "task-scan-1",
      barcode: "EXT-001",
      unit_created: true,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockServerWithProfile } from "../helpers/server-auth";
import { createAdminFromMock } from "../helpers/supabase-mocks";

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

describe("Courier handovers list contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("GET /api/ops/courier-handovers returns expected, received and extra breakdown", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "worker",
      warehouseId: "w1",
      userId: "worker-1",
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_handover_sessions: [
        {
          data: [
            {
              id: "h1",
              shift_id: "s1",
              courier_user_id: "courier-1",
              status: "draft",
              started_at: "2026-01-01T10:00:00.000Z",
              confirmed_at: null,
              receiver_user_id: null,
              note: null,
              meta: null,
            },
          ],
          error: null,
        },
      ],
      warehouse_handover_items: [
        {
          data: [
            {
              id: "hi-pending",
              handover_session_id: "h1",
              unit_id: "u1",
              task_id: "t1",
              condition_status: "ok",
              meta: { source_kind: "expected", receiving_status: "pending" },
            },
            {
              id: "hi-received",
              handover_session_id: "h1",
              unit_id: "u2",
              task_id: "t2",
              condition_status: "ok",
              meta: {
                source_kind: "expected",
                receiving_status: "received",
                received_at: "2026-01-01T10:05:00.000Z",
                received_via: "courier_receiving",
              },
            },
            {
              id: "hi-extra",
              handover_session_id: "h1",
              unit_id: "u3",
              task_id: null,
              condition_status: "ok",
              meta: {
                source_kind: "extra",
                receiving_status: "received",
                received_at: "2026-01-01T10:06:00.000Z",
                received_via: "courier_receiving",
              },
            },
          ],
          error: null,
        },
      ],
      units: [
        {
          data: [
            { id: "u1", barcode: "111111", status: "out", cell_id: null },
            { id: "u2", barcode: "222222", status: "receiving", cell_id: "bin-1" },
            { id: "u3", barcode: "333333", status: "receiving", cell_id: "bin-1" },
          ],
          error: null,
        },
      ],
      profiles: [
        {
          data: [{ id: "courier-1", full_name: "Courier One" }],
          error: null,
        },
      ],
      warehouse_cells_map: [
        {
          data: [{ id: "bin-1" }],
          error: null,
        },
      ],
      unit_moves: [
        {
          data: [
            { unit_id: "u2", created_at: "2026-01-01T10:05:00.000Z" },
            { unit_id: "u3", created_at: "2026-01-01T10:06:00.000Z" },
          ],
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const { GET } = await import("../../app/api/ops/courier-handovers/route");

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      handovers: [
        expect.objectContaining({
          handover_session_id: "h1",
          courier_name: "Courier One",
          expected_total: 2,
          received_total: 1,
          remaining_total: 1,
          extra_total: 1,
        }),
      ],
    });
    expect(json.handovers[0].remaining_items).toHaveLength(1);
    expect(json.handovers[0].received_items).toHaveLength(1);
    expect(json.handovers[0].extra_items).toHaveLength(1);
  });

  it("GET /api/ops/courier-handovers/lost returns unresolved lost items", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "worker",
      warehouseId: "w1",
      userId: "worker-1",
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_handover_sessions: [
        {
          data: [
            {
              id: "h-lost",
              shift_id: "s-lost",
              courier_user_id: "courier-2",
              status: "confirmed",
              started_at: "2026-01-01T09:00:00.000Z",
              confirmed_at: "2026-01-01T09:30:00.000Z",
              receiver_user_id: "worker-1",
              note: null,
              meta: null,
            },
          ],
          error: null,
        },
      ],
      warehouse_handover_items: [
        {
          data: [
            {
              id: "hi-lost",
              handover_session_id: "h-lost",
              unit_id: "u-lost",
              task_id: "t-lost",
              condition_status: "ok",
              meta: {
                source_kind: "expected",
                receiving_status: "lost",
                lost_at: "2026-01-01T09:30:00.000Z",
                lost_by: "worker-1",
              },
            },
          ],
          error: null,
        },
      ],
      units: [
        {
          data: [{ id: "u-lost", barcode: "999999", status: "out", cell_id: null }],
          error: null,
        },
      ],
      profiles: [
        {
          data: [{ id: "courier-2", full_name: "Courier Lost" }],
          error: null,
        },
      ],
      warehouse_cells_map: [
        {
          data: [{ id: "bin-1" }],
          error: null,
        },
      ],
      unit_moves: [
        {
          data: [],
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const { GET } = await import("../../app/api/ops/courier-handovers/lost/route");

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      lost_items: [
        expect.objectContaining({
          handover_item_id: "hi-lost",
          unit_barcode: "999999",
          courier_name: "Courier Lost",
          handover_session_id: "h-lost",
        }),
      ],
    });
  });
});

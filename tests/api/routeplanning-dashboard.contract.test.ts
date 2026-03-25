import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminFromMock } from "../helpers/supabase-mocks";

const supabaseServerMock = vi.fn();
const requireUserProfileMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("../../app/api/_shared/user-profile", () => ({
  requireUserProfile: requireUserProfileMock,
}));

describe("Route planning dashboard contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("GET /api/routeplanning/dashboard hides dropped point after move to BIN", async () => {
    supabaseServerMock.mockResolvedValue({});
    requireUserProfileMock.mockResolvedValue({
      ok: true,
      profile: {
        warehouse_id: "w1",
        role: "admin",
      },
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_cells: [
        {
          data: [],
          error: null,
        },
      ],
      profiles: [
        {
          data: [{ id: "courier-1", full_name: "Courier One", role: "courier" }],
          error: null,
        },
      ],
      delivery_zones: [
        {
          data: [],
          error: null,
        },
      ],
      courier_shifts: [
        {
          data: [],
          error: null,
        },
      ],
      courier_task_events: [
        {
          data: [
            {
              id: "drop-1",
              task_id: "t1",
              unit_id: "u1",
              courier_user_id: "courier-1",
              happened_at: "2026-01-01T10:00:00.000Z",
              lat: 40.4093,
              lng: 49.8671,
              note: null,
              proof_meta: null,
            },
          ],
          error: null,
        },
      ],
      courier_tasks: [
        {
          data: [],
          error: null,
        },
      ],
      units: [
        {
          data: [
            {
              id: "u1",
              barcode: "111111",
              status: "receiving",
              cell_id: "bin-1",
              meta: null,
            },
          ],
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
          data: [{ unit_id: "u1", created_at: "2026-01-01T10:05:00.000Z" }],
          error: null,
        },
      ],
      outbound_shipments: [
        {
          data: [],
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { GET } = await import("../../app/api/routeplanning/dashboard/route");

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      drop_points: [],
      dropped_units: [],
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminFromMock, createQueryChain, type MockPlan } from "../helpers/supabase-mocks";

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

function mockServerClient(plans: MockPlan) {
  const counters: Record<string, number> = {};
  supabaseServerMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "worker-1", email: "worker@example.com" } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      counters[table] = counters[table] ?? 0;
      const idx = counters[table]++;
      const plan = plans[table]?.[idx] ?? { data: null, error: null };
      return createQueryChain(plan);
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
}

describe("Receiving reconciliation contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("POST /api/receiving/scan turns a lost handover item into received", async () => {
    mockServerClient({
      profiles: [
        {
          data: {
            warehouse_id: "w1",
            role: "worker",
            full_name: "Worker One",
          },
          error: null,
        },
      ],
      warehouse_cells_map: [
        {
          data: {
            id: "bin-1",
            code: "BIN-1",
            cell_type: "bin",
            is_active: true,
            meta: {},
          },
          error: null,
        },
      ],
      units: [
        {
          data: {
            id: "u1",
            barcode: "111111",
            cell_id: "bin-1",
            status: "receiving",
          },
          error: null,
        },
      ],
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      units: [
        {
          data: null,
          error: null,
        },
      ],
      outbound_shipments: [
        {
          data: null,
          error: null,
        },
      ],
      warehouse_handover_items: [
        {
          data: [
            {
              id: "hi1",
              handover_session_id: "h1",
              meta: {
                source_kind: "expected",
                receiving_status: "lost",
                lost_at: "2026-01-01T09:30:00.000Z",
              },
            },
          ],
          error: null,
        },
        {
          data: null,
          error: null,
        },
      ],
      warehouse_handover_sessions: [
        {
          data: [
            {
              id: "h1",
              status: "confirmed",
              started_at: "2026-01-01T09:00:00.000Z",
              confirmed_at: "2026-01-01T09:30:00.000Z",
            },
          ],
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const { POST } = await import("../../app/api/receiving/scan/route");

    const res = await POST(
      new Request("http://localhost/api/receiving/scan", {
        method: "POST",
        body: JSON.stringify({
          cellCode: "BIN-1",
          unitBarcode: "111111",
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      unitId: "u1",
      barcode: "111111",
    });
    expect(adminMock.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "warehouse_handover_items",
          payload: expect.objectContaining({
            meta: expect.objectContaining({
              receiving_status: "received",
              received_via: "regular_receiving",
            }),
          }),
        }),
      ]),
    );
  });
});

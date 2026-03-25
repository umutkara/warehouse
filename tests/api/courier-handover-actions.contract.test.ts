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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Courier handover action contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("POST /api/ops/courier-handovers/scan marks expected item as received", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "worker",
      warehouseId: "w1",
      userId: "worker-1",
    });

    const receiveScanMock = vi.fn(async () =>
      jsonResponse({
        ok: true,
        unitId: "u1",
        barcode: "111111",
        cell: { id: "bin-1", code: "BIN-1", cell_type: "bin" },
        status: "receiving",
      }),
    );

    const loadComputedHandoversMock = vi.fn(async () => [
      {
        handover_session_id: "h1",
        remaining_total: 0,
      },
    ]);

    vi.doMock("../../app/api/receiving/scan/route", () => ({
      POST: receiveScanMock,
    }));
    vi.doMock("../../app/api/ops/courier-handovers/_shared", async () => {
      const actual = await vi.importActual<any>("../../app/api/ops/courier-handovers/_shared");
      return {
        ...actual,
        loadComputedHandovers: loadComputedHandoversMock,
      };
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_handover_sessions: [
        {
          data: { id: "h1", warehouse_id: "w1", status: "draft" },
          error: null,
        },
      ],
      warehouse_handover_items: [
        {
          data: {
            id: "hi1",
            task_id: "t1",
            meta: { source_kind: "expected", receiving_status: "pending" },
          },
          error: null,
        },
        {
          data: null,
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const { POST } = await import("../../app/api/ops/courier-handovers/scan/route");

    const res = await POST(
      new Request("http://localhost/api/ops/courier-handovers/scan", {
        method: "POST",
        body: JSON.stringify({
          handoverId: "h1",
          cellCode: "BIN-1",
          unitBarcode: "111111",
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(receiveScanMock).toHaveBeenCalledTimes(1);
    expect(json).toMatchObject({
      ok: true,
      item_kind: "expected",
    });
    expect(adminMock.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "warehouse_handover_items",
          payload: expect.objectContaining({
            meta: expect.objectContaining({
              receiving_status: "received",
              received_via: "courier_receiving",
            }),
          }),
        }),
      ]),
    );
  });

  it("POST /api/ops/courier-handovers/scan creates extra item for out-of-route unit", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "worker",
      warehouseId: "w1",
      userId: "worker-1",
    });

    vi.doMock("../../app/api/receiving/scan/route", () => ({
      POST: vi.fn(async () =>
        jsonResponse({
          ok: true,
          unitId: "u-extra",
          barcode: "333333",
          cell: { id: "bin-1", code: "BIN-1", cell_type: "bin" },
          status: "receiving",
        }),
      ),
    }));
    vi.doMock("../../app/api/ops/courier-handovers/_shared", async () => {
      const actual = await vi.importActual<any>("../../app/api/ops/courier-handovers/_shared");
      return {
        ...actual,
        loadComputedHandovers: vi.fn(async () => [
          {
            handover_session_id: "h1",
            extra_total: 1,
          },
        ]),
      };
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_handover_sessions: [
        {
          data: { id: "h1", warehouse_id: "w1", status: "draft" },
          error: null,
        },
      ],
      warehouse_handover_items: [
        {
          data: null,
          error: null,
        },
        {
          data: null,
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const { POST } = await import("../../app/api/ops/courier-handovers/scan/route");

    const res = await POST(
      new Request("http://localhost/api/ops/courier-handovers/scan", {
        method: "POST",
        body: JSON.stringify({
          handoverId: "h1",
          cellCode: "BIN-1",
          unitBarcode: "333333",
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      item_kind: "extra",
    });
    expect(adminMock.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "warehouse_handover_items",
          payload: expect.objectContaining({
            handover_session_id: "h1",
            unit_id: "u-extra",
            meta: expect.objectContaining({
              source_kind: "extra",
              receiving_status: "received",
              received_via: "courier_receiving",
            }),
          }),
        }),
      ]),
    );
  });

  it("POST /api/ops/courier-handovers/close marks remaining items as lost", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "worker",
      warehouseId: "w1",
      userId: "worker-1",
    });

    const draftHandover = {
      handover_session_id: "h1",
      shift_id: "s1",
      courier_user_id: "courier-1",
      status: "draft",
      expected_total: 7,
      received_total: 6,
      remaining_total: 1,
      lost_total: 0,
      extra_total: 1,
      remaining_items: [
        {
          handover_item_id: "hi1",
          unit_id: "u1",
          unit_barcode: "111111",
        },
      ],
      received_items: [],
      lost_items: [],
      extra_items: [],
    };
    const confirmedHandover = {
      ...draftHandover,
      status: "confirmed",
      remaining_total: 0,
      lost_total: 1,
      remaining_items: [],
      lost_items: [
        {
          handover_item_id: "hi1",
          unit_id: "u1",
          unit_barcode: "111111",
        },
      ],
    };

    vi.doMock("../../app/api/ops/courier-handovers/_shared", async () => {
      const actual = await vi.importActual<any>("../../app/api/ops/courier-handovers/_shared");
      return {
        ...actual,
        loadComputedHandovers: vi
          .fn()
          .mockResolvedValueOnce([draftHandover])
          .mockResolvedValueOnce([confirmedHandover]),
      };
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      warehouse_handover_items: [
        {
          data: {
            id: "hi1",
            meta: { source_kind: "expected", receiving_status: "pending" },
          },
          error: null,
        },
        {
          data: null,
          error: null,
        },
      ],
      warehouse_handover_sessions: [
        {
          data: null,
          error: null,
        },
      ],
      courier_shifts: [
        {
          data: null,
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as any);

    const { POST } = await import("../../app/api/ops/courier-handovers/close/route");

    const res = await POST(
      new Request("http://localhost/api/ops/courier-handovers/close", {
        method: "POST",
        body: JSON.stringify({
          handoverId: "h1",
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.summary).toMatchObject({
      expected_total: 7,
      received_total: 6,
      lost_total: 1,
      extra_total: 1,
    });
    expect(adminMock.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "warehouse_handover_items",
          payload: expect.objectContaining({
            meta: expect.objectContaining({
              receiving_status: "lost",
            }),
          }),
        }),
        expect.objectContaining({
          table: "warehouse_handover_sessions",
          payload: expect.objectContaining({
            status: "confirmed",
          }),
        }),
        expect.objectContaining({
          table: "courier_shifts",
          payload: expect.objectContaining({
            status: "closed",
          }),
        }),
      ]),
    );
  });
});

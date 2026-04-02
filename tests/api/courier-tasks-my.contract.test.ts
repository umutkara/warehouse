import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminFromMock } from "../helpers/supabase-mocks";

const requireCourierAuthMock = vi.fn();

vi.mock("../../app/api/courier/_shared/auth", () => ({
  requireCourierAuth: requireCourierAuthMock,
}));

vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe("Courier tasks my contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("GET /api/courier/tasks/my does not mark confirmed assignment as self pickup from unit meta only", async () => {
    requireCourierAuthMock.mockResolvedValue({
      ok: true,
      user: { id: "courier-1" },
      profile: { warehouse_id: "w1", role: "courier" },
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      courier_tasks: [
        {
          data: [
            {
              id: "task-1",
              pool_id: null,
              shift_id: "shift-1",
              unit_id: "unit-1",
              status: "claimed",
              claimed_at: "2026-01-01T10:00:00.000Z",
              accepted_at: null,
              delivered_at: null,
              failed_at: null,
              returned_at: null,
              fail_reason: null,
              fail_comment: null,
              current_lat: null,
              current_lng: null,
              last_event_at: "2026-01-01T10:00:00.000Z",
              meta: {
                source: "api.courier.assignments.confirm",
                shipment_id: "shipment-1",
                scenario: "Склад Возвратов → Мерчант",
              },
            },
          ],
          error: null,
        },
      ],
      units: [
        {
          data: [
            {
              id: "unit-1",
              barcode: "555",
              status: "out",
              product_name: "Phone",
              partner_name: "Partner",
              meta: {
                external_pickup: true,
              },
            },
          ],
          error: null,
        },
      ],
      picking_task_units: [
        {
          data: [],
          error: null,
        },
      ],
      picking_tasks: [
        {
          data: [],
          error: null,
        },
        {
          data: [],
          error: null,
        },
      ],
      outbound_shipments: [
        {
          data: [
            {
              id: "shipment-1",
              unit_id: "unit-1",
              meta: {
                courier_pickup_status: "confirmed",
                courier_pickup_confirmed_at: "2026-01-01T10:00:00.000Z",
              },
            },
          ],
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { GET } = await import("../../app/api/courier/tasks/my/route");
    const res = await GET(new Request("http://localhost/api/courier/tasks/my"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0]).toMatchObject({
      id: "task-1",
      shipment_id: "shipment-1",
      pickup_confirmed: true,
      self_pickup: false,
    });
  });

  it("GET /api/courier/tasks/my keeps scan-claim task as self pickup", async () => {
    requireCourierAuthMock.mockResolvedValue({
      ok: true,
      user: { id: "courier-1" },
      profile: { warehouse_id: "w1", role: "courier" },
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      courier_tasks: [
        {
          data: [
            {
              id: "task-1",
              pool_id: null,
              shift_id: "shift-1",
              unit_id: "unit-1",
              status: "claimed",
              claimed_at: "2026-01-01T10:00:00.000Z",
              accepted_at: null,
              delivered_at: null,
              failed_at: null,
              returned_at: null,
              fail_reason: null,
              fail_comment: null,
              current_lat: null,
              current_lng: null,
              last_event_at: "2026-01-01T10:00:00.000Z",
              meta: {
                source: "api.courier.tasks.scan_claim",
              },
            },
          ],
          error: null,
        },
      ],
      units: [
        {
          data: [
            {
              id: "unit-1",
              barcode: "999",
              status: "out",
              product_name: "Phone",
              partner_name: "Partner",
              meta: {
                external_pickup: true,
              },
            },
          ],
          error: null,
        },
      ],
      picking_task_units: [
        {
          data: [],
          error: null,
        },
      ],
      picking_tasks: [
        {
          data: [],
          error: null,
        },
        {
          data: [],
          error: null,
        },
      ],
      outbound_shipments: [
        {
          data: [
            {
              id: "shipment-1",
              unit_id: "unit-1",
              meta: {},
            },
          ],
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { GET } = await import("../../app/api/courier/tasks/my/route");
    const res = await GET(new Request("http://localhost/api/courier/tasks/my"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0]).toMatchObject({
      id: "task-1",
      self_pickup: true,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminFromMock } from "../helpers/supabase-mocks";

const requireCourierAuthMock = vi.fn();

vi.mock("../../app/api/courier/_shared/auth", () => ({
  requireCourierAuth: requireCourierAuthMock,
}));

vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

describe("Courier task event contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("POST /api/courier/tasks/[taskId]/event requires comment for client accepted", async () => {
    requireCourierAuthMock.mockResolvedValue({
      ok: true,
      user: { id: "courier-1" },
      profile: { warehouse_id: "w1", role: "courier" },
    });

    const { POST } = await import("../../app/api/courier/tasks/[taskId]/event/route");
    const res = await POST(
      new Request("http://localhost/api/courier/tasks/task-1/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType: "dropped",
          eventId: "evt-client-accepted",
          opsStatus: "client_accepted",
          lat: 40.1,
          lng: 49.8,
          proof: {
            receiver_signature: "data:image/png;base64,ZmFrZQ==",
          },
        }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toMatchObject({
      error: "Комментарий обязателен для выбранного OPS статуса",
    });
  });

  it("POST /api/courier/tasks/[taskId]/event allows client rejected without comment", async () => {
    requireCourierAuthMock.mockResolvedValue({
      ok: true,
      user: { id: "courier-1" },
      profile: { warehouse_id: "w1", role: "courier" },
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      courier_tasks: [
        {
          data: {
            id: "task-1",
            warehouse_id: "w1",
            unit_id: "unit-1",
            courier_user_id: "courier-1",
            shift_id: "shift-1",
            status: "claimed",
            meta: {
              source: "api.courier.assignments.confirm",
              scenario: "Склад Возвратов → Клиент",
            },
          },
          error: null,
        },
        {
          data: null,
          error: null,
        },
      ],
      courier_task_events: [
        {
          data: null,
          error: null,
        },
        {
          data: {
            id: "db-event-2",
            event_type: "ops_status_update",
            happened_at: "2026-01-01T10:00:00.000Z",
          },
          error: null,
        },
      ],
      units: [
        {
          data: {
            id: "unit-1",
            barcode: "222",
            meta: {},
          },
          error: null,
        },
        {
          data: {
            id: "unit-1",
            barcode: "222",
            meta: {},
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
    vi.mocked(supabaseAdmin.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/signature.png" } })),
    } as any);

    const { POST } = await import("../../app/api/courier/tasks/[taskId]/event/route");
    const res = await POST(
      new Request("http://localhost/api/courier/tasks/task-1/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType: "ops_status_update",
          eventId: "evt-2",
          opsStatus: "client_rejected",
          lat: 40.1,
          lng: 49.8,
          proof: {},
        }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: "claimed",
      event: {
        id: "db-event-2",
        event_type: "ops_status_update",
      },
    });

    expect(adminMock.inserts).toContainEqual(
      expect.objectContaining({
        table: "courier_task_events",
        payload: expect.objectContaining({
          task_id: "task-1",
          event_type: "ops_status_update",
          note: null,
        }),
      }),
    );
  });

  it("POST /api/courier/tasks/[taskId]/event keeps task active for partner rejected return", async () => {
    requireCourierAuthMock.mockResolvedValue({
      ok: true,
      user: { id: "courier-1" },
      profile: { warehouse_id: "w1", role: "courier" },
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      courier_tasks: [
        {
          data: {
            id: "task-1",
            warehouse_id: "w1",
            unit_id: "unit-1",
            courier_user_id: "courier-1",
            shift_id: "shift-1",
            status: "claimed",
            meta: {
              source: "api.courier.assignments.confirm",
              scenario: "Склад Возвратов → Мерчант",
            },
          },
          error: null,
        },
        {
          data: null,
          error: null,
        },
      ],
      courier_task_events: [
        {
          data: null,
          error: null,
        },
        {
          data: {
            id: "db-event-1",
            event_type: "ops_status_update",
            happened_at: "2026-01-01T10:00:00.000Z",
          },
          error: null,
        },
      ],
      units: [
        {
          data: {
            id: "unit-1",
            barcode: "666",
            meta: {},
          },
          error: null,
        },
        {
          data: {
            id: "unit-1",
            barcode: "666",
            meta: {},
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
    vi.mocked(supabaseAdmin.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/signature.png" } })),
    } as any);

    const { POST } = await import("../../app/api/courier/tasks/[taskId]/event/route");
    const res = await POST(
      new Request("http://localhost/api/courier/tasks/task-1/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType: "ops_status_update",
          eventId: "evt-1",
          opsStatus: "partner_rejected_return",
          note: "ref",
          lat: 40.1,
          lng: 49.8,
          proof: {
            receiver_signature: "data:image/png;base64,ZmFrZQ==",
            act_photo_url: "https://example.com/act.jpg",
          },
        }),
      }),
      { params: Promise.resolve({ taskId: "task-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      status: "claimed",
      event: {
        id: "db-event-1",
        event_type: "ops_status_update",
      },
    });

    expect(adminMock.inserts).toContainEqual(
      expect.objectContaining({
        table: "courier_task_events",
        payload: expect.objectContaining({
          task_id: "task-1",
          event_type: "ops_status_update",
        }),
      }),
    );

    expect(adminMock.updates).toContainEqual(
      expect.objectContaining({
        table: "courier_tasks",
        payload: expect.objectContaining({
          status: "claimed",
          meta: expect.objectContaining({
            source: "api.courier.tasks.event",
            last_event_type: "ops_status_update",
            ops_status: "partner_rejected_return",
          }),
        }),
      }),
    );

    expect(adminMock.updates).toContainEqual(
      expect.objectContaining({
        table: "units",
        payload: expect.objectContaining({
          meta: expect.objectContaining({
            ops_status: "partner_rejected_return",
            ops_status_source: "courier_status_update",
          }),
        }),
      }),
    );
  });
});

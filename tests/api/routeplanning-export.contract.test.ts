import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
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

describe("Route planning export contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("GET /api/routeplanning/export returns 400 for invalid period", async () => {
    supabaseServerMock.mockResolvedValue({});
    requireUserProfileMock.mockResolvedValue({
      ok: true,
      profile: { warehouse_id: "w1", role: "admin" },
    });

    const { GET } = await import("../../app/api/routeplanning/export/route");
    const req = new Request(
      "http://localhost/api/routeplanning/export?from=2026-02-02T12:00:00.000Z&to=2026-02-01T12:00:00.000Z",
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Дата 'от'");
  });

  it("GET /api/routeplanning/export returns xlsx with events and tasks", async () => {
    supabaseServerMock.mockResolvedValue({});
    requireUserProfileMock.mockResolvedValue({
      ok: true,
      profile: { warehouse_id: "w1", role: "admin" },
    });

    const { supabaseAdmin } = await import("../../lib/supabase/admin");
    const adminMock = createAdminFromMock({
      profiles: [
        {
          data: [{ id: "courier-1", full_name: "Courier One" }],
          error: null,
        },
      ],
      courier_shifts: [
        {
          data: [
            {
              id: "shift-1",
              courier_user_id: "courier-1",
              status: "open",
              started_at: "2026-02-01T09:00:00.000Z",
              closed_at: null,
              start_note: "started",
              close_note: null,
            },
          ],
          error: null,
        },
      ],
      courier_tasks: [
        {
          data: [
            {
              id: "task-1",
              courier_user_id: "courier-1",
              unit_id: "unit-1",
              shift_id: "shift-1",
              status: "failed",
              claimed_at: "2026-02-01T09:10:00.000Z",
              accepted_at: "2026-02-01T09:12:00.000Z",
              delivered_at: null,
              failed_at: "2026-02-01T10:00:00.000Z",
              returned_at: null,
              fail_reason: "client_absent",
              fail_comment: "no answer",
              last_event_at: "2026-02-01T10:00:00.000Z",
              updated_at: "2026-02-01T10:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
      courier_task_events: [
        {
          data: [
            {
              id: "event-1",
              courier_user_id: "courier-1",
              task_id: "task-1",
              unit_id: "unit-1",
              event_type: "failed",
              happened_at: "2026-02-01T10:00:00.000Z",
              note: "door closed",
              proof_meta: { ops_status: "client_rejected" },
              lat: 40.4,
              lng: 49.8,
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
              barcode: "12345",
              status: "out",
              cell_id: "cell-a",
              meta: { ops_status: "client_rejected" },
            },
          ],
          error: null,
        },
      ],
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(adminMock.from as any);

    const { GET } = await import("../../app/api/routeplanning/export/route");
    const req = new Request(
      "http://localhost/api/routeplanning/export?from=2026-02-01T00:00:00.000Z&to=2026-02-01T23:59:59.999Z",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toContain(".xlsx");

    const buf = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toContain("Events");
    expect(wb.SheetNames).toContain("Tasks");

    const events = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Events);
    const tasks = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Tasks);
    expect(events.length).toBe(1);
    expect(tasks.length).toBe(1);
    expect(events[0]["Курьер ID"]).toBe("courier-1");
    expect(events[0]["OPS статус"]).toBe("client_rejected");
    expect(tasks[0]["Причина фейла"]).toBe("client_absent");
  });
});

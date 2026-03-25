import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.fn();
const supabaseAdminFromMock = vi.fn();
const supabaseAdminMock: any = {
  from: supabaseAdminFromMock,
};

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

type PlanResult = {
  data: any;
  error: any;
  count?: number;
};

function makeAwaitableChain(result: PlanResult) {
  const chain: any = {
    data: result.data,
    error: result.error,
  };
  if (typeof result.count === "number") {
    chain.count = result.count;
  }
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);
  chain.ilike = vi.fn(() => chain);
  chain.contains = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: result.data, error: result.error }));
  chain.maybeSingle = vi.fn(async () => ({ data: result.data, error: result.error }));
  return chain;
}

function setupAdminPlans(plans: Record<string, PlanResult[]>) {
  supabaseAdminFromMock.mockImplementation((table: string) => {
    const queue = plans[table];
    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected admin table call: ${table}`);
    }
    return makeAwaitableChain(queue.shift()!);
  });
}

function setupServerProfile(options?: {
  warehouseId?: string;
  role?: string;
  userId?: string;
  extraPlans?: Record<string, PlanResult[]>;
}) {
  const warehouseId = options?.warehouseId ?? "w1";
  const role = options?.role ?? "worker";
  const userId = options?.userId ?? "u1";
  const extraPlans = options?.extraPlans ?? {};

  const profileQueue: PlanResult[] = [{ data: { warehouse_id: warehouseId, role }, error: null }];
  const plans: Record<string, PlanResult[]> = {
    profiles: profileQueue,
    ...extraPlans,
  };

  const fromMock = vi.fn((table: string) => {
    const queue = plans[table];
    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected server table call: ${table}`);
    }
    const result = queue.shift()!;
    return makeAwaitableChain(result);
  });

  supabaseServerMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
    from: fromMock,
  });
}

describe("Cell source of truth contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses unit.cell_id mapping in units/list even when status is rejected", async () => {
    setupServerProfile({
      warehouseId: "w1",
      extraPlans: {},
    });
    setupAdminPlans({
      units: [
        {
          data: [
            {
              id: "unit-1",
              barcode: "31025621317",
              status: "rejected",
              product_name: "Product",
              partner_name: "Partner",
              price: 10,
              cell_id: "cell-client",
              created_at: "2026-03-01T10:00:00.000Z",
              meta: {},
              warehouse_cells: { code: "CLIENT 1", cell_type: "storage" },
            },
          ],
          error: null,
        },
        {
          data: null,
          error: null,
          count: 1,
        },
        {
          data: [
            {
              id: "unit-1",
              barcode: "31025621317",
              status: "rejected",
              product_name: "Product",
              partner_name: "Partner",
              price: 10,
              cell_id: "cell-client",
              created_at: "2026-03-01T10:00:00.000Z",
              meta: {},
              warehouse_cells: { code: "CLIENT 1", cell_type: "storage" },
            },
          ],
          error: null,
        },
      ],
      warehouse_cells_map: [
        {
          data: [{ id: "cell-client", code: "CLIENT 1", cell_type: "storage" }],
          error: null,
        },
        {
          data: [{ id: "cell-rej", code: "REJECTED 164", cell_type: "rejected" }],
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

    const { GET } = await import("../../app/api/units/list/route");
    const res = await GET(new Request("http://localhost/api/units/list?search=31025621317"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.units).toHaveLength(1);
    expect(json.units[0]).toMatchObject({
      barcode: "31025621317",
      status: "rejected",
      cell_code: "CLIENT 1",
      cell_type: "storage",
    });
  });

  it("uses unit.cell_id mapping in units/find for warehouse map search", async () => {
    setupServerProfile({
      warehouseId: "w1",
      extraPlans: {
        units: [
          {
            data: {
              id: "unit-1",
              barcode: "31025621317",
              cell_id: "cell-client",
              status: "rejected",
              created_at: "2026-03-01T10:00:00.000Z",
            },
            error: null,
          },
        ],
        warehouse_cells_map: [
          {
            data: {
              id: "cell-client",
              code: "CLIENT 1",
              cell_type: "storage",
              x: 0,
              y: 0,
              w: 56,
              h: 56,
              meta: {},
              is_active: true,
              warehouse_id: "w1",
            },
            error: null,
          },
        ],
      },
    });

    const { GET } = await import("../../app/api/units/find/route");
    const res = await GET(new Request("http://localhost/api/units/find?barcode=31025621317"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cell).toMatchObject({
      id: "cell-client",
      code: "CLIENT 1",
      cell_type: "storage",
    });
  });

  it("uses current unit cell in tsd shipping-tasks/list when status is rejected", async () => {
    setupServerProfile({
      warehouseId: "w1",
      role: "worker",
      userId: "u1",
    });
    setupAdminPlans({
      picking_tasks: [
        {
          data: [
            {
              id: "task-1",
              status: "open",
              scenario: "test",
              created_at: "2026-03-01T10:00:00.000Z",
              created_by_name: "OPS",
              picked_at: null,
              picked_by: null,
              completed_at: null,
              target_picking_cell_id: "cell-pick",
            },
          ],
          error: null,
        },
      ],
      picking_task_units: [
        {
          data: [
            {
              picking_task_id: "task-1",
              unit_id: "unit-1",
              from_cell_id: "cell-client",
              units: {
                id: "unit-1",
                barcode: "31025621317",
                cell_id: "cell-client",
                status: "rejected",
              },
            },
          ],
          error: null,
        },
      ],
      units: [
        {
          data: [{ id: "unit-1", cell_id: "cell-client" }],
          error: null,
        },
      ],
      warehouse_cells_map: [
        {
          data: [
            { id: "cell-client", code: "CLIENT 1", cell_type: "storage" },
            { id: "cell-pick", code: "PICK-01", cell_type: "picking" },
          ],
          error: null,
        },
        {
          data: [{ id: "cell-rej", code: "REJECTED 164", cell_type: "rejected" }],
          error: null,
        },
      ],
    });

    const { GET } = await import("../../app/api/tsd/shipping-tasks/list/route");
    const res = await GET(new Request("http://localhost/api/tsd/shipping-tasks/list"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0].units[0].cell).toMatchObject({
      code: "CLIENT 1",
      cell_type: "storage",
    });
  });
});

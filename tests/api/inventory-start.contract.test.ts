import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryChain } from "../helpers/supabase-mocks";
import { mockServerUnauthorized, mockServerWithProfile } from "../helpers/server-auth";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

async function callInventoryStart(body?: Record<string, unknown>) {
  const { POST } = await import("../../app/api/inventory/start/route");
  return POST(
    new Request("http://localhost/api/inventory/start", {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

describe("POST /api/inventory/start contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized user", async () => {
    mockServerUnauthorized(supabaseServerMock);
    const res = await callInventoryStart();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("returns 404 when profile not found", async () => {
    const profileChain = createQueryChain({ data: null, error: null });
    supabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      },
      from: vi.fn(() => profileChain),
      rpc: vi.fn(),
    });

    const res = await callInventoryStart();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Profile not found" });
  });

  it("returns 403 for unsupported role", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "worker", userId: "u1", rpc: vi.fn() });
    const res = await callInventoryStart();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  it("returns 400 when cellCodes is not an array", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "admin", userId: "u1", rpc: vi.fn() });
    const res = await callInventoryStart({ cellCodes: "A1" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "cellCodes must be an array of strings",
    });
  });

  it("returns 400 when cellTypes is not an array", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "admin", userId: "u1", rpc: vi.fn() });
    const res = await callInventoryStart({ cellTypes: "rejected" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "cellTypes must be an array of strings",
    });
  });

  it("returns 400 for unsupported cell type", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "admin", userId: "u1", rpc: vi.fn() });
    const res = await callInventoryStart({ cellTypes: ["INVALID"] });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Unsupported cell type: invalid",
    });
  });

  it("passes normalized filters to inventory_start RPC", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { ok: true, sessionId: "s1", tasksCreated: 2 },
      error: null,
    });
    mockServerWithProfile({ supabaseServerMock, role: "manager", userId: "u1", rpc: rpcMock });

    const res = await callInventoryStart({
      cellCodes: [" a1 ", "A1", "a2"],
      cellTypes: [" Rejected ", "shipping", "SHIPPING"],
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, sessionId: "s1", tasksCreated: 2 });
    expect(rpcMock).toHaveBeenCalledWith("inventory_start", {
      p_cell_codes: ["A1", "A2"],
      p_cell_types: ["rejected", "shipping"],
    });
  });

  it("supports snake_case request fields", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { ok: true, sessionId: "s2", tasksCreated: 1 },
      error: null,
    });
    mockServerWithProfile({ supabaseServerMock, role: "admin", userId: "u1", rpc: rpcMock });

    const res = await callInventoryStart({
      cell_codes: ["b1"],
      cell_types: ["storage"],
    });

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("inventory_start", {
      p_cell_codes: ["B1"],
      p_cell_types: ["storage"],
    });
  });

  it("passes null filters when no filters provided", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { ok: true, sessionId: "s3", tasksCreated: 10 },
      error: null,
    });
    mockServerWithProfile({ supabaseServerMock, role: "head", userId: "u1", rpc: rpcMock });

    const res = await callInventoryStart();
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("inventory_start", {
      p_cell_codes: null,
      p_cell_types: null,
    });
  });

  it("returns 400 when RPC fails", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "admin",
      userId: "u1",
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "No cells matched the provided filters" },
      }),
    });

    const res = await callInventoryStart({ cellCodes: ["Z999"] });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "No cells matched the provided filters",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryChain } from "../helpers/supabase-mocks";
import { callInventoryCancel } from "../helpers/api-callers";
import { mockServerUnauthorized, mockServerWithProfile } from "../helpers/server-auth";

const supabaseServerMock = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: supabaseServerMock,
}));

describe("POST /api/inventory/cancel contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthorized user", async () => {
    mockServerUnauthorized(supabaseServerMock);
    const res = await callInventoryCancel();

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

    const res = await callInventoryCancel();

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Profile not found" });
  });

  it("returns 403 for unsupported role", async () => {
    mockServerWithProfile({ supabaseServerMock, role: "logistics", userId: "u1" });
    const res = await callInventoryCancel();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" });
  });

  it("returns 400 when RPC returns error", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "admin",
      userId: "u1",
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "function inventory_cancel() does not exist" },
      }),
    });

    const res = await callInventoryCancel();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "function inventory_cancel() does not exist",
    });
  });

  it("returns 400 when RPC returns ok: false (business logic error)", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "manager",
      userId: "u1",
      rpc: vi.fn().mockResolvedValue({
        data: { ok: false, error: "Inventory is not active" },
        error: null,
      }),
    });

    const res = await callInventoryCancel();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Inventory is not active",
    });
  });

  it("returns 200 with reversedMoves when RPC succeeds", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { ok: true, reversedMoves: 3 },
      error: null,
    });

    mockServerWithProfile({
      supabaseServerMock,
      role: "admin",
      userId: "u1",
      rpc: rpcMock,
    });

    const res = await callInventoryCancel();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      reversedMoves: 3,
    });
    expect(rpcMock).toHaveBeenCalledWith("inventory_cancel");
  });

  it("handles RPC returning JSON string", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "head",
      userId: "u1",
      rpc: vi.fn().mockResolvedValue({
        data: JSON.stringify({ ok: true, reversedMoves: 0 }),
        error: null,
      }),
    });

    const res = await callInventoryCancel();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      reversedMoves: 0,
    });
  });

  it("returns 500 on unexpected exception", async () => {
    mockServerWithProfile({
      supabaseServerMock,
      role: "admin",
      userId: "u1",
      rpc: vi.fn().mockRejectedValue(new Error("Database connection lost")),
    });

    const res = await callInventoryCancel();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "Database connection lost",
    });
  });
});

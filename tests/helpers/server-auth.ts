import { vi } from "vitest";
import { createQueryChain } from "./supabase-mocks";

type MockServerWithProfileParams = {
  supabaseServerMock: ReturnType<typeof vi.fn>;
  role: string;
  warehouseId?: string;
  userId?: string;
  fullName?: string;
  rpc?: ReturnType<typeof vi.fn>;
};

export function mockServerUnauthorized(supabaseServerMock: ReturnType<typeof vi.fn>) {
  supabaseServerMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  });
}

export function mockServerAuthOnly(params: {
  supabaseServerMock: ReturnType<typeof vi.fn>;
  userId?: string;
  rpc?: ReturnType<typeof vi.fn>;
}) {
  const { supabaseServerMock, userId = "u1", rpc } = params;
  supabaseServerMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
    ...(rpc ? { rpc } : {}),
  });
}

export function mockServerWithProfile(params: MockServerWithProfileParams) {
  const {
    supabaseServerMock,
    role,
    warehouseId = "w1",
    userId = "user-1",
    fullName,
    rpc,
  } = params;

  const profileChain = createQueryChain({
    data: {
      warehouse_id: warehouseId,
      role,
      ...(fullName ? { full_name: fullName } : {}),
    },
    error: null,
  });

  supabaseServerMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
    from: vi.fn(() => profileChain),
    ...(rpc ? { rpc } : {}),
  });

  return profileChain;
}

import { vi } from "vitest";

export type MockPlan = Record<string, Array<{ data: any; error: any }>>;

export function createQueryChain(finalResult: unknown) {
  const chain: Record<string, any> = {};
  if (finalResult && typeof finalResult === "object") {
    chain.data = (finalResult as any).data ?? null;
    chain.error = (finalResult as any).error ?? null;
  } else {
    chain.data = null;
    chain.error = null;
  }

  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(async () => finalResult);
  chain.maybeSingle = vi.fn(async () => finalResult);
  return chain;
}

export function createAdminFromMock(plans: MockPlan) {
  const tableCalls: string[] = [];
  const updates: Array<{ table: string; payload: any }> = [];
  const inserts: Array<{ table: string; payload: any }> = [];
  const counters: Record<string, number> = {};

  const from = vi.fn((table: string) => {
    tableCalls.push(table);
    counters[table] = counters[table] ?? 0;
    const idx = counters[table]++;
    const plan = plans[table]?.[idx] ?? { data: null, error: null };

    const chain: Record<string, any> = {
      data: plan.data,
      error: plan.error,
    };

    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.single = vi.fn(async () => plan);
    chain.maybeSingle = vi.fn(async () => plan);
    chain.update = vi.fn((payload: any) => {
      updates.push({ table, payload });
      return chain;
    });
    chain.insert = vi.fn((payload: any) => {
      inserts.push({ table, payload });
      return chain;
    });

    return chain;
  });

  return { from, tableCalls, updates, inserts };
}

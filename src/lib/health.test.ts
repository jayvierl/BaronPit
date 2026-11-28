import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ available: true }));
vi.mock("@/lib/db", () => ({ dbAvailable: () => state.available }));

import { GET } from "../app/api/health/route";

describe("health endpoint", () => {
  it("answers liveness regardless of storage state", async () => {
    state.available = false;
    const res = await GET(new Request("https://app.test/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("readiness is 200 with db:true when storage is configured", async () => {
    state.available = true;
    const res = await GET(new Request("https://app.test/api/health?ready=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true });
  });

  it("readiness is 503 with db:false when storage is unavailable", async () => {
    state.available = false;
    const res = await GET(new Request("https://app.test/api/health?ready=1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, db: false });
  });
});

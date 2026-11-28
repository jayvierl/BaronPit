import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/client-error/route";
import { postgres } from "../../test/postgres";
import { q } from "./db";

vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));

const origin = "https://app.test";
function report(ip: string, body: unknown = { message: "boom", digest: "d1", path: "/player" }) {
  return new Request(origin + "/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin, "x-vercel-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/inert-test");
  vi.stubEnv("VERCEL_ENV", "development");
  vi.stubEnv("VERCEL", "1");
  await q`SELECT 1`;
}, 30000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await postgres.close();
});

describe("client-error stopgap", () => {
  it("logs one structured line and answers 204", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(report("203.0.113.10"));
      expect(res.status).toBe(204);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(spy.mock.calls[0][0]))).toEqual({
        source: "client-error",
        message: "boom",
        digest: "d1",
        path: "/player",
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("rate-limits one IP to 30 reports per minute without affecting others", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const ip = "203.0.113.99";
      for (let i = 0; i < 30; i++) {
        expect((await POST(report(ip))).status).toBe(204);
      }
      expect((await POST(report(ip))).status).toBe(429);
      expect((await POST(report("203.0.113.100"))).status).toBe(204);
      expect(spy).toHaveBeenCalledTimes(31);
    } finally {
      spy.mockRestore();
    }
  });
});

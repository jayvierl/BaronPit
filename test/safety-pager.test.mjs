import { describe, expect, it, vi } from "vitest";
import { deliverPage, pageEnvelope, pagingEndpoint } from "../scripts/safety-pager.mjs";
const row = { receipt:"2adee113-ad1f-4234-91c2-fe1586e54f1b", opened_at:"2026-11-26T00:00:00Z", original_evidence:"private", reporter:"private" };
describe("urgent responder paging", () => {
  it("sends an opaque receipt only to the configured endpoint and rejects redirects", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null,{status:202}));
    await deliverPage(row, pagingEndpoint("https://oncall.example/operator"), "secret", mock);
    const [, init] = mock.mock.calls[0];
    expect(init.redirect).toBe("error");
    expect(init.headers["idempotency-key"]).toBe(row.receipt);
    expect(JSON.parse(init.body)).toEqual({event:"community.safety.urgent",receipt:row.receipt,openedAt:"2026-11-26T00:00:00.000Z"});
  });
  it("rejects insecure destinations and malformed receipts", () => {
    for (const url of ["http://oncall.example","https://secret@oncall.example"]) expect(() => pagingEndpoint(url)).toThrow();
    expect(() => pageEnvelope({...row,receipt:"private-user-id"})).toThrow();
  });
  it("treats an unaccepted delivery as retryable", async () => {
    await expect(deliverPage(row,new URL("https://oncall.example"),"secret",async()=>new Response(null,{status:503}))).rejects.toThrow("unconfirmed");
  });
});

import { describe, expect, it } from "vitest";
import { GET } from "../app/.well-known/security.txt/route";

describe("security.txt", () => {
  it("serves the RFC 9116 disclosure contact as plain text", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("Contact: mailto:security@baronpit.com");
    expect(body).toContain("Expires: 2027-11-27");
    expect(body).toContain("Canonical: https://baronpit.com/.well-known/security.txt");
    expect(body).toContain("Preferred-Languages: en");
  });
});

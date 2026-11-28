import { SECURITY_EMAIL } from "@/lib/brand";

// RFC 9116 security.txt: the machine-readable disclosure contact for
// vulnerability reports. Kept deliberately minimal and static.
export async function GET() {
  const body = [
    `Contact: mailto:${SECURITY_EMAIL}`,
    "Expires: 2027-11-27T00:00:00.000Z",
    "Canonical: https://baronpit.com/.well-known/security.txt",
    "Preferred-Languages: en",
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

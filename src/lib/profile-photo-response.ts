const photoHeaders = {
  "Cache-Control":"private, no-store, max-age=0", Vary:"Cookie", "X-Content-Type-Options":"nosniff",
  "X-Robots-Tag":"noindex, noarchive", "Cross-Origin-Resource-Policy":"same-origin", "Referrer-Policy":"no-referrer",
};
export function photoResponse(bytes: Buffer | null, status = 404) {
  return bytes ? new Response(new Uint8Array(bytes),{headers:{...photoHeaders,"Content-Type":"image/webp"}})
    : new Response(null,{status,headers:photoHeaders});
}

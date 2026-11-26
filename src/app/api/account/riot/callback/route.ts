import { NextResponse } from "next/server";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { authError } from "@/lib/auth-http";
import { consumeOwnershipState, fetchOwnedRiotId, riotSignOnConfig, verifyLinkedOwner } from "@/lib/riot-ownership";

export async function GET(request: Request) {
  const config=riotSignOnConfig();
  if (!config) return authError("Riot Sign On is awaiting provider configuration.",503);
  const complete=(status:string) => NextResponse.redirect(config.origin+"/me?verification="+status,
    {status:303,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  try {
    const user=await getCurrentUser();
    if (!user || !user.termsCurrent || isBanned(user)) return complete("restart");
    const params=new URL(request.url).searchParams;
    const target=await consumeOwnershipState(user.id,params.get("state") ?? "");
    if (!target) return complete("restart");
    if (params.has("error")) return complete("cancelled");
    const owned=await fetchOwnedRiotId(config,params.get("code") ?? "");
    if (!owned) return complete("unavailable");
    return complete(await verifyLinkedOwner(user.id,target,owned) ? "verified" : "mismatch");
  } catch { return complete("unavailable"); }
}

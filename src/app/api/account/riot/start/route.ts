import { NextResponse } from "next/server";
import { requireUser, authError, readObject } from "@/lib/auth-http";
import { rateLimit } from "@/lib/auth";
import { authorizationUrl, beginOwnership, riotSignOnConfig } from "@/lib/riot-ownership";

export async function POST(request: Request) {
  const config=riotSignOnConfig();
  if (!config) return authError("Riot Sign On is awaiting provider configuration.",503);
  const access=await requireUser(request);
  if (!access.ok) return access.response;
  if (request.headers.get("origin")!==config.origin) return authError("Open your account on the main website to verify.",403);
  const {puuid}=await readObject(request);
  if (typeof puuid!=="string" || !puuid || puuid.length>128) return authError("Choose a linked Riot profile.",400);
  try {
    if (!await rateLimit(access.user.id,"riot-verify",5,15)) return authError("Please wait before starting another verification.",429);
    const state=await beginOwnership(access.user.id,puuid);
    if (!state) return authError("Choose a linked Riot profile that still needs verification.",400);
    return NextResponse.json({ok:true,href:authorizationUrl(config,state).href},{headers:{"Cache-Control":"no-store"}});
  } catch { return authError("Riot verification is temporarily unavailable.",503); }
}

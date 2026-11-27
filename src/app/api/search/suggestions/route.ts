import { getCurrentUser } from "@/lib/auth";
import { isPlatform } from "@/lib/platforms";
import { canSuggestNames, searchNameSuggestions } from "@/lib/search-suggestions";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const term = params.get("q") ?? "";
  const scope = params.get("scope") ?? "all";
  const region = params.get("region") || undefined;
  if ((scope !== "all" && scope !== "players" && scope !== "people" && scope !== "mentions") ||
      (region !== undefined && !isPlatform(region)) || term.length > 80) {
    return Response.json({ error: "Invalid suggestion search." }, { status: 400, headers });
  }
  if (!canSuggestNames(term, scope)) return Response.json({ suggestions: [] }, { headers });
  try {
    const viewer = await getCurrentUser();
    const suggestions = await searchNameSuggestions(term, scope, viewer?.id ?? null, region);
    return Response.json({ suggestions }, { headers });
  } catch {
    return Response.json({ error: "Name suggestions are temporarily unavailable." }, { status: 503, headers });
  }
}

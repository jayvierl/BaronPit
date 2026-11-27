"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isPlatform, playerStatsHref, PLATFORMS, type PlatformId } from "@/lib/platforms";
import { searchHref, withSearchReturn } from "@/lib/search-scopes";
import type { SearchSuggestion, SuggestionScope } from "@/lib/search-suggestions";
import { PlayerNameInput } from "./player-name-input";

export function SearchNameFields({ scope, initialQuery, initialRegion, placeholder }: {
  scope: SuggestionScope;
  initialQuery: string;
  initialRegion?: PlatformId;
  placeholder: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [region, setRegion] = useState(initialRegion);

  function openSuggestion(suggestion: SearchSuggestion) {
    const target = suggestion.kind === "player"
      ? playerStatsHref(suggestion.platform, suggestion.riotId)
      : `/u/${suggestion.id}`;
    router.push(withSearchReturn(target, searchHref(scope, query.trim(), region, true)));
  }

  return <>
    <PlayerNameInput name="q" label={scope === "players" ? "Player name or Riot ID" : "Search the community"}
      value={query} onChange={setQuery} placeholder={placeholder} scope={scope} region={region}
      onSelect={openSuggestion} maxLength={80}/>
    {scope === "players" && <select name="region" aria-label="League region" value={region ?? ""}
      onChange={event => setRegion(isPlatform(event.target.value) ? event.target.value : undefined)}>
      <option value="">All regions</option>
      {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>}
  </>;
}

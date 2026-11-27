import catalog from "./match-loadout-catalog.json";
import type { MatchSummary } from "./pure";

// A small display catalog derived from Riot's Data Dragon summoner.json and
// runesReforged.json. The versioned spell images use the same source patch.
const root = "https://ddragon.leagueoflegends.com/cdn";
const spells = new Map(catalog.spells.map(entry => [entry.id, entry]));
const styles = new Map(catalog.styles.map(entry => [entry.id, entry]));
const keystones = new Map(catalog.keystones.map(entry => [entry.id, entry]));

function runeLabel(entry: { name: string; icon: string } | undefined, prefix: string) {
  return entry ? { name: `${prefix}: ${entry.name}`, icon: `${root}/img/${entry.icon}` } : { name: `${prefix} unavailable` };
}

export function matchLoadout({ spellIds, runes }: Pick<MatchSummary, "spellIds" | "runes">) {
  return {
    spells: spellIds?.map(id => {
      const spell = spells.get(id);
      return spell ? { name: spell.name, icon: `${root}/${catalog.patch}/img/spell/${spell.icon}` }
        : { name: `Unlisted spell ${id}` };
    }) ?? [],
    runes: runes ? [
      runeLabel(keystones.get(runes.keystone), "Keystone"),
      runeLabel(styles.get(runes.primaryStyle), "Primary"),
      runeLabel(styles.get(runes.secondaryStyle), "Secondary"),
    ] : [],
  };
}

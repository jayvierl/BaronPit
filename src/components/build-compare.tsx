"use client";
import { publicPatch } from "@/lib/patch-notes";
import { useId, useState } from "react";
import Link from "next/link";
import type { RuneChoice, ShopItem } from "@/lib/build-catalog";
import { pathCost, type BuildPath } from "@/lib/build-comparison";
import styles from "./build-compare.module.css";

function RuneEditor({
  path,
  options,
  onChange,
}: {
  path: BuildPath;
  options: RuneChoice[];
  onChange: (patch: Partial<BuildPath>) => void;
}) {
  const chosen = options.filter((r) => path.runes.includes(r.id));
  const keystone = chosen.find((r) => r.slot === 0);
  function setKeystone(id: number) {
    const next = options.find((r) => r.id === id);
    const kept = next?.tree === keystone?.tree ? path.runes.filter((id) => id !== keystone?.id) : [];
    onChange({
      runes: id ? [id, ...kept] : [],
      secondaryTree: next?.tree === keystone?.tree ? path.secondaryTree : "",
    });
  }
  return (
    <details className={styles.runes}>
      <summary>
        {keystone?.name || (path.runeNotes ? "Author’s rune notes" : "Choose runes")}
        {chosen.length > 1 && ` + ${chosen.length - 1}`}
      </summary>
      {path.runeNotes && (
        <p>
          <strong>Author’s rune notes</strong>
          <br />
          {path.runeNotes}
        </p>
      )}
      <label className="field">
        Keystone
        <select value={keystone?.id ?? ""} onChange={(e) => setKeystone(Number(e.target.value))}>
          <option value="">Choose a keystone</option>
          {options
            .filter((r) => r.slot === 0)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.tree} · {r.name}
              </option>
            ))}
        </select>
      </label>
      {keystone && (
        <>
          <p className="meta">{keystone.effect}</p>
          {[1, 2, 3].map((slot) => {
            const group = options.filter((r) => r.tree === keystone.tree && r.slot === slot);
            const selected = chosen.find((r) => group.includes(r));
            return (
              <label className="field" key={slot}>
                {keystone.tree} · row {slot}
                <select
                  value={selected?.id ?? ""}
                  onChange={(e) =>
                    onChange({
                      runes: [
                        ...path.runes.filter((id) => id !== selected?.id),
                        ...(e.target.value ? [Number(e.target.value)] : []),
                      ],
                    })
                  }
                >
                  <option value="">Choose a rune</option>
                  {group.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {selected && <span className="meta">{selected.effect}</span>}
              </label>
            );
          })}
          <label className="field">
            Secondary path
            <select
              value={path.secondaryTree}
              onChange={(e) =>
                onChange({
                  secondaryTree: e.target.value,
                  runes: chosen.filter((r) => r.tree === keystone.tree).map((r) => r.id),
                })
              }
            >
              <option value="">Choose a secondary path</option>
              {[...new Set(options.map((r) => r.tree))]
                .filter((tree) => tree !== keystone.tree)
                .map((tree) => (
                  <option key={tree}>{tree}</option>
                ))}
            </select>
          </label>
          {path.secondaryTree && (
            <fieldset className={styles.secondary}>
              <legend>Up to two different rows</legend>
              {options
                .filter((r) => r.tree === path.secondaryTree && r.slot > 0)
                .map((r) => {
                  const active = path.runes.includes(r.id),
                    other = chosen.filter((c) => c.tree === path.secondaryTree && c.slot !== r.slot);
                  return (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={!active && other.length >= 2}
                        onChange={() =>
                          onChange({
                            runes: [
                              ...chosen
                                .filter((c) => c.tree !== r.tree || c.slot !== r.slot)
                                .map((c) => c.id),
                              ...(active ? [] : [r.id]),
                            ],
                          })
                        }
                      />
                      {r.name}
                      {active && <span className="meta"> · {r.effect}</span>}
                    </label>
                  );
                })}
            </fieldset>
          )}
        </>
      )}
    </details>
  );
}
function PathEditor({
  label,
  path,
  choices,
  items,
  runes,
  catalog,
  change,
  listId,
}: {
  label: string;
  path: BuildPath;
  choices: BuildPath[];
  items: ShopItem[];
  runes: RuneChoice[];
  catalog: Map<number, ShopItem>;
  change: (p: BuildPath) => void;
  listId: string;
}) {
  const [query, setQuery] = useState("");
  const [customized, setCustomized] = useState(false);
  const candidate = items.find((i) => i.name.toLowerCase() === query.trim().toLowerCase());
  function edit(patch: Partial<BuildPath>) {
    setCustomized(true);
    change({ ...path, ...patch });
  }
  return (
    <section className={styles.panel} aria-label={label}>
      <h2>{label}</h2>
      <label className="field">
        Starting build
        <select
          value={path.key}
          onChange={(e) => {
            const selected = choices.find((c) => c.key === e.target.value);
            if (selected) {
              change(selected);
              setQuery("");
              setCustomized(false);
            }
          }}
        >
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <p>{path.rationale || "The author shared no rationale."}</p>
      {path.post && (
        <Link href={`/post/${path.post}`}>Read the original build{publicPatch(path.patch) ? ` · Patch ${publicPatch(path.patch)}` : ""}</Link>
      )}
      <p className={styles.cost}>
        <strong>{pathCost(path.items, catalog).toLocaleString("en-US")}g</strong> · {path.items.length}/6
        items{customized && " · Edited"}
      </p>
      <ol className={styles.selections}>
        {path.items.map((id, index) => {
          const item = catalog.get(id);
          return (
            item && (
              <li key={`${id}-${index}`}>
                <div>
                  <Link href={`/items/${id}`}>{item.name}</Link>
                  <span className="meta"> · {item.gold}g</span>
                </div>
                <details>
                  <summary>Item effect</summary>
                  <p className={styles.effect}>{item.effect || "Riot lists no effect text for this item."}</p>
                </details>
                <button
                  type="button"
                  className="text-btn"
                  aria-label={`Remove ${item.name} from ${label}`}
                  onClick={() => edit({ items: path.items.filter((_, i) => i !== index) })}
                >
                  Remove
                </button>
              </li>
            )
          );
        })}
      </ol>
      {path.items.length < 6 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (candidate) {
              edit({ items: [...path.items, candidate.id] });
              setQuery("");
            }
          }}
        >
          <label className="field">
            Add an item
            <input
              list={listId}
              placeholder="Search the shop"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button type="submit" className="btn secondary small" disabled={!candidate}>
            Add item
          </button>
        </form>
      )}
      <RuneEditor path={path} options={runes} onChange={edit} />
    </section>
  );
}
export function BuildCompare({
  items,
  runes,
  choices,
  initial,
}: {
  items: ShopItem[];
  runes: RuneChoice[];
  choices: BuildPath[];
  initial?: string;
}) {
  const initialA = choices.find((c) => c.key === initial) ?? choices[0];
  const [left, setLeft] = useState<BuildPath>(initialA);
  const [right, setRight] = useState<BuildPath>(choices.find((c) => c.key !== initialA.key) ?? choices[1]);
  const [matchup, setMatchup] = useState("");
  const listId = useId();
  const catalog = new Map(items.map((i) => [i.id, i]));
  const difference = pathCost(left.items, catalog) - pathCost(right.items, catalog);
  return (
    <>
      <label className="field">
        Enemy composition or matchup
        <input
          maxLength={160}
          placeholder="e.g. Leona and Kai’Sa"
          value={matchup}
          onChange={(e) => setMatchup(e.target.value)}
        />
      </label>
      <div className={styles.totals} aria-label="Gold comparison">
        <div>
          Path A <strong>{pathCost(left.items, catalog).toLocaleString("en-US")}g</strong>
        </div>
        <div>
          Path B <strong>{pathCost(right.items, catalog).toLocaleString("en-US")}g</strong>
        </div>
      </div>
      <p className={styles.summary} role="status">
        {difference === 0
          ? "Both paths cost the same."
          : `Path ${difference > 0 ? "A" : "B"} costs ${Math.abs(difference).toLocaleString("en-US")}g more.`}
        {matchup.trim() && ` Comparing into ${matchup.trim()}.`}
      </p>
      <datalist id={listId}>
        {Array.from(new Set(items.map((i) => i.name))).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className={styles.grid}>
        <PathEditor
          label="Path A"
          path={left}
          change={setLeft}
          choices={choices}
          items={items}
          runes={runes}
          catalog={catalog}
          listId={listId}
        />
        <PathEditor
          label="Path B"
          path={right}
          change={setRight}
          choices={choices}
          items={items}
          runes={runes}
          catalog={catalog}
          listId={listId}
        />
      </div>
    </>
  );
}

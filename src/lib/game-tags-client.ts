"use client";

import { useEffect, useState } from "react";
import type { TagCatalog } from "./game-tags";

let pending: Promise<TagCatalog | null> | undefined;

/** Fetch the tag catalog once per page; every chip and composer shares it. */
export function loadTagCatalog(): Promise<TagCatalog | null> {
  pending ??= fetch("/api/game-tags")
    .then(async (response) => {
      if (!response.ok) throw new Error("Tag catalog unavailable");
      const data = (await response.json()) as TagCatalog;
      if (!Array.isArray(data.champions) || !Array.isArray(data.items)) throw new Error("Tag catalog unavailable");
      return data;
    })
    .catch(() => null);
  return pending;
}

/** The shared tag catalog, or null until it loads (chips render name + icon meanwhile). */
export function useTagCatalog(): TagCatalog | null {
  const [catalog, setCatalog] = useState<TagCatalog | null>(null);
  useEffect(() => {
    let live = true;
    void loadTagCatalog().then((loaded) => {
      if (live) setCatalog(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return catalog;
}

import { plainBodyText } from "./game-tags";

/** Apply preview limits to readable text, including when a tag crosses the cutoff. */
export function tagExcerpt(body: string, limit: number) {
  return Array.from(plainBodyText(body)).slice(0, limit).join("");
}

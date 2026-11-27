import { formatTagToken, parseBodySegments, plainBodyText } from "./game-tags";

/** Slice by visible caret offsets. A whole name keeps its link; editing through a name releases it to plain text. */
export function sliceTagDraft(body: string, start: number, end = Infinity) {
  let offset = 0;
  let result = "";
  for (const segment of parseBodySegments(body)) {
    const label = segment.type === "tag" ? segment.tag.name : segment.text;
    const next = offset + label.length;
    if (start < next && end > offset) {
      result += segment.type === "tag" && start <= offset && next <= end
        ? formatTagToken(segment.tag)
        : label.slice(Math.max(0, start - offset), Math.max(0, end - offset));
    }
    offset = next;
  }
  return result;
}

export function editedTagDraft(body: string, next: string, caret: number) {
  const previous = plainBodyText(body);
  if (previous === next) return body;
  let suffix = 0;
  while (suffix < previous.length && suffix < next.length - caret &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  let prefix = 0;
  while (prefix < previous.length - suffix && prefix < caret && previous[prefix] === next[prefix]) prefix++;
  return sliceTagDraft(body, 0, prefix) + next.slice(prefix, next.length - suffix) +
    sliceTagDraft(body, previous.length - suffix);
}

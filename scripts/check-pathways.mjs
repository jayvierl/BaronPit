import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const maxDepth = 3;
const maxPages = 120;
const maxRedirects = 4;
const batchSize = 4;
const publicPaths = /^\/(?:$|about$|activity$|builds(?:\/compare)?$|champions$|guidelines$|items\/\d+$|lfg(?:\/thanks)?$|me(?:\/safety)?$|pilot(?:\/phone-test)?$|playbook$|player$|post\/\d+$|privacy$|profile(?:\/edit)?$|questions(?:\/new)?$|review-hour(?:\/calendar)?$|rooms(?:\/[\w-]+)?$|safety$|search$|signin(?:\/confirm)?$|terms$|u\/\d+$)/;
const namedEntities = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
const degradedViews = [
  "The feed is temporarily unavailable", "Room posts are temporarily unavailable", "Search is temporarily unavailable",
  "Live player lookup is temporarily unavailable", "The Riot API didn't answer just now", "Duo Finder couldn’t load",
  "Your private inbox is unavailable",
];

function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, part) => {
    if (!part.startsWith("#")) return namedEntities[part.toLowerCase()] ?? entity;
    const hex = part[1]?.toLowerCase() === "x";
    const point = Number.parseInt(part.slice(hex ? 2 : 1), hex ? 16 : 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

function attributes(markup) {
  return Object.fromEntries([...markup.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g)]
    .map(([, name, double, single, bare]) => [name.toLowerCase(), decode(double ?? single ?? bare)]));
}

function htmlText(html) {
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function documentMarkup(html) {
  // Exclude hydration payloads and CSS so only rendered markup participates in the graph.
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi, "");
}

function family(url) {
  const [, top, child] = url.pathname.split("/");
  if (!top) return "home";
  if (top === "rooms" && child) return child.startsWith("champ-") ? "champion-room" : "room";
  if (top === "u") return "community-profile";
  if (top === "player") return url.searchParams.has("riotId") ? "riot-profile" : "lookup";
  return top;
}

function pathKey(url) {
  const query = new URLSearchParams(url.search);
  query.sort();
  return url.pathname + (query.size ? `?${query}` : "");
}

function fragmentId(url) {
  try { return decodeURIComponent(url.hash.slice(1)); }
  catch { return url.hash.slice(1); }
}

function eligible(url, root) {
  return url.origin === root.origin && !url.username && !url.password &&
    publicPaths.test(url.pathname) && !url.searchParams.has("token") && !url.searchParams.has("force");
}

function authDestination(url, root) {
  const next = url.searchParams.get("next");
  if (!next?.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(next)) return null;
  try {
    const target = new URL(next, root);
    return eligible(target, root) && target.pathname !== "/signin" ? target : null;
  } catch { return null; }
}

function parseDocument(html) {
  const markup = documentMarkup(html);
  const links = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap(([, raw, inner]) => {
    const { href, "aria-label": label } = attributes(raw);
    return href ? [{ href, label: (label || htmlText(inner)).slice(0, 90) }] : [];
  });
  const ids = new Set([...markup.matchAll(/<[a-z][\w:-]*\b([^>]*)>/gi)].flatMap(([, raw]) => {
    const { id } = attributes(raw);
    return id ? [id] : [];
  }));
  const heading = htmlText(markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const statuses = [...markup.matchAll(/<(p|div)\b([^>]*\brole\s*=\s*(?:"(?:alert|status)"|'(?:alert|status)')[^>]*)>([\s\S]*?)<\/\1>/gi)]
    .filter(([, , raw]) => ["alert", "status"].includes(attributes(raw).role))
    .map(([, , , body]) => htmlText(body));
  const refresh = [...markup.matchAll(/<meta\b([^>]*)>/gi)].map(([, raw]) => attributes(raw))
    .find(attrs => attrs["http-equiv"]?.toLowerCase() === "refresh")?.content?.match(/;\s*url=(.+)$/i)?.[1];
  const nativeSearch = [...markup.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].some(([, raw, body]) => {
    const attrs = attributes(raw);
    return attrs.action === "/search" && (attrs.method ?? "get").toLowerCase() === "get" &&
      /\bname=["']q["']/i.test(body);
  });
  return { links, ids, heading, refresh, nativeSearch, statuses };
}

async function requestPage(initial, root, cache, cookie) {
  let current = initial;
  const visited = new Set();
  const redirects = [];
  for (let count = 0; count <= maxRedirects; count += 1) {
    const key = pathKey(current);
    if (visited.has(key)) throw new Error(`redirect loop at ${key}`);
    visited.add(key);
    if (!cache.has(key)) {
      cache.set(key, (async () => {
        const response = await fetch(new URL(key, root), {
          method: "GET", redirect: "manual", signal: AbortSignal.timeout(15000), ...(cookie ? { headers: { cookie } } : {}),
        });
        const { headers, status } = response;
        const location = headers.get("location");
        const type = headers.get("content-type") ?? "";
        const isHtml = type.includes("text/html");
        const html = isHtml ? await response.text() : "";
        if (!isHtml) await response.body?.cancel();
        return { location, status, type, html, document: html ? parseDocument(html) : null };
      })());
    }
    const result = await cache.get(key);
    const destination = result.status >= 300 && result.status < 400 ? result.location : result.document?.refresh;
    if (destination) {
      const url = new URL(destination, current);
      if (!eligible(url, root)) throw new Error(`unexpected redirect outside the audit to ${url.href}`);
      redirects.push({ from: key, to: pathKey(url) });
      current = url;
      continue;
    }
    if (result.status !== 200 || result.html.includes("NEXT_HTTP_ERROR_FALLBACK;404")) {
      throw new Error(`HTTP ${result.html.includes("NEXT_HTTP_ERROR_FALLBACK;404") ? "200 with streamed 404" : result.status} at ${key}`);
    }
    if (result.document?.heading === "This page is temporarily unavailable" || /NEXT_HTTP_ERROR_FALLBACK;5\d\d/.test(result.html)) {
      throw new Error(`page error boundary at ${key}`);
    }
    if (!result.document && !(current.pathname === "/review-hour/calendar" && result.type.includes("text/calendar"))) {
      throw new Error(`unexpected ${result.type || "empty content type"} at ${key}`);
    }
    return { url: current, document: result.document, redirects };
  }
  throw new Error(`over ${maxRedirects} redirects`);
}

export async function checkPathways(origin, { fixtureSession } = {}) {
  const root = new URL(origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(root.hostname);
  if (root.protocol !== "https:" && !(root.protocol === "http:" && local)) {
    throw new Error("Use HTTPS or a local fixture origin.");
  }
  if (fixtureSession !== undefined && (!local || !/^[\da-f]{64}$/i.test(fixtureSession))) {
    throw new Error("A fixture session must be a test token on a loopback origin.");
  }
  const cookie = fixtureSession ? `wp_session=${fixtureSession}` : undefined;
  const queue = [];
  const scheduled = new Set();
  const documents = new Map();
  const familyCounts = new Map();
  const observed = new Map();
  const cache = new Map();
  const issues = [];
  const limits = { signin: 24, search: 14, room: 12, "champion-room": 8, "community-profile": 12, post: 12, "riot-profile": 6 };
  let omitted = 0;
  let riotQueue = Promise.resolve();

  function schedule(url, depth, source) {
    const key = pathKey(url);
    if (scheduled.has(key)) return;
    const category = family(url);
    const count = familyCounts.get(category) ?? 0;
    if (scheduled.size >= maxPages || count >= (limits[category] ?? 8) || depth > maxDepth) return;
    scheduled.add(key);
    familyCounts.set(category, count + 1);
    queue.push({ url, key, depth, source });
  }

  function remember(href, from, source, label, depth) {
    let url;
    try { url = new URL(href, from); }
    catch { return; }
    if (url.origin !== root.origin) return;
    if (!eligible(url, root)) { omitted += 1; return; }
    const edge = `${source}\n${pathKey(url)}${url.hash}`;
    if (!observed.has(edge)) observed.set(edge, { source, url, label });
    schedule(url, depth, source);
  }

  schedule(new URL("/", root), 0, "entry");
  while (queue.length) {
    const batch = queue.splice(0, batchSize);
    const results = await Promise.allSettled(batch.map(job => {
      const request = () => requestPage(job.url, root, cache, cookie);
      if (local || family(job.url) !== "riot-profile") return request();
      // A cold player lookup can make several Riot API calls. Serialize this family on a live origin.
      const result = riotQueue.then(request);
      riotQueue = result.then(() => delay(350), () => delay(350));
      return result;
    }));
    for (const [index, result] of results.entries()) {
      const { url, key, depth, source } = batch[index];
      if (result.status === "rejected") {
        const code = result.reason.cause?.code;
        issues.push({ source, target: key, problem: result.reason.message + (code ? ` (${code})` : "") });
        continue;
      }
      const page = result.value;
      documents.set(key, page);
      if (page.url.pathname === "/signin") {
        const next = authDestination(page.url, root);
        if (page.url.searchParams.has("next") && !next) issues.push({ source, target: key, problem: "invalid sign-in return destination" });
        if (next) remember(next.href, page.url, key, "Sign-in return", depth + 1);
        if (page.redirects.length && url.pathname !== "/signin" && pathKey(next ?? new URL("/me", root)) !== key) {
          issues.push({ source, target: key, problem: `sign-in returns to ${next ? pathKey(next) : "/me"}` });
        }
      }
      if (!page.document) continue;
      const degradation = degradedViews.find(message => page.document.statuses.some(status => status.startsWith(message)));
      if (degradation) issues.push({ source, target: key, problem: degradation });
      if (family(page.url) === "riot-profile" && page.document.heading === "Lookup") {
        issues.push({ source, target: key, problem: "linked Riot profile did not resolve" });
      }
      for (const { href, label } of page.document.links) remember(href, page.url, key, label, depth + 1);
      if (page.document.nativeSearch && !page.url.searchParams.has("q")) {
        remember("/search?q=Baron", root, key, "Native search example", depth + 1);
      }
    }
  }

  let anchorsChecked = 0;
  let linksChecked = 0;
  const unvisited = new Set();
  for (const { source, url, label } of observed.values()) {
    const key = pathKey(url);
    if (!scheduled.has(key)) unvisited.add(key);
    if (scheduled.has(key)) linksChecked += 1;
    const page = documents.get(key);
    if (!url.hash || !page?.document || (page.url.pathname === "/signin" && url.pathname !== "/signin")) continue;
    anchorsChecked += 1;
    if (!page.document.ids.has(fragmentId(url))) issues.push({ source, target: key + url.hash, label, problem: "missing fragment target" });
  }

  return {
    origin: root.origin,
    limits: { depth: maxDepth, pages: maxPages },
    requests: cache.size,
    destinations: documents.size,
    linksObserved: observed.size,
    linksChecked,
    anchorsChecked,
    signInContinuations: [...documents.values()].filter(page => page.url.pathname === "/signin" && authDestination(page.url, root)).length,
    families: Object.fromEntries([...familyCounts].sort()),
    outsideScope: omitted,
    sampledOut: unvisited.size,
    issues,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await checkPathways(process.argv[2] ?? "https://baronpit.com");
  console.log(JSON.stringify(report, null, 2));
  if (report.issues.length) process.exitCode = 1;
}

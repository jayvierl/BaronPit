import { safeReturnTo } from "./signin-return";

export function composeDestination(pathname: string) {
  return pathname === "/" || /^\/rooms\/[a-z0-9-]+\/?$/i.test(pathname) ? "#compose" : "/#compose";
}

export function previousAppPage(previous: string | null | undefined, current: string): string | null {
  if (!previous) return null;
  try {
    const source = new URL(previous), destination = new URL(current);
    const route = source.pathname + source.search + source.hash;
    if (source.origin !== destination.origin || source.username || source.password || safeReturnTo(route) !== route) return null;
    if (source.pathname === destination.pathname && source.search === destination.search) return null;
    return route;
  } catch {
    return null;
  }
}

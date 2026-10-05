import { useCallback, useEffect, useState } from "react";

export interface Route {
  /** First path segment, e.g. `results`. */
  page: string;
  /** Remaining segments, e.g. `["<runId>"]`. */
  params: string[];
  /** Query string of the hash route. */
  search: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path = "", search = ""] = raw.split("?");
  const segments = path.split("/").filter(Boolean);
  return {
    page: segments[0] ?? "dashboard",
    params: segments.slice(1),
    search: new URLSearchParams(search),
  };
}

/**
 * Hash-based routing. It needs no server-side rewrite rules, so the built
 * client works unchanged on any static host.
 */
export function useRouter(): Route & { navigate: (to: string) => void } {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((to: string) => {
    const next = to.startsWith("#") ? to : `#/${to.replace(/^\/+/, "")}`;
    if (window.location.hash === next) setRoute(parse(next));
    else window.location.hash = next;
  }, []);

  return { ...route, navigate };
}

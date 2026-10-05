/**
 * Minimal robots.txt support.
 *
 * This is a safety rail, not a complete REP implementation: it honours
 * `User-agent`, `Disallow`, `Allow` (longest-match-wins, as search engines do)
 * and `Crawl-delay`. Fetches are cached per origin for the lifetime of the
 * process so a run does not re-request robots.txt on every page.
 */

interface Rule {
  path: string;
  allow: boolean;
}

export interface RobotsPolicy {
  /** No robots.txt (or it was unreachable) means nothing is disallowed. */
  rules: Rule[];
  crawlDelayMs: number | null;
  source: "fetched" | "missing" | "error";
}

const cache = new Map<string, Promise<RobotsPolicy>>();

function parseRobots(text: string, userAgent: string): RobotsPolicy {
  const ua = userAgent.toLowerCase();
  // group name -> rules, so we can pick the most specific matching group.
  const groups: { agents: string[]; rules: Rule[]; crawlDelay: number | null }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }

    lastLineWasAgent = false;
    if (!current) continue;

    if (field === "disallow") current.rules.push({ path: value, allow: false });
    else if (field === "allow") current.rules.push({ path: value, allow: true });
    else if (field === "crawl-delay") {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds * 1000;
    }
  }

  // Prefer the group whose agent token is the longest match for our UA.
  let best: (typeof groups)[number] | null = null;
  let bestScore = -1;
  for (const group of groups) {
    for (const agent of group.agents) {
      const score = agent === "*" ? 0 : ua.includes(agent) ? agent.length : -1;
      if (score > bestScore) {
        bestScore = score;
        best = group;
      }
    }
  }

  return {
    rules: best?.rules ?? [],
    crawlDelayMs: best?.crawlDelay ?? null,
    source: "fetched",
  };
}

function matchesPattern(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const segments = body.split("*");

  let cursor = 0;
  for (const [index, segment] of segments.entries()) {
    if (segment === "") continue;
    const found = index === 0 ? (path.startsWith(segment) ? 0 : -1) : path.indexOf(segment, cursor);
    if (found === -1) return false;
    cursor = found + segment.length;
  }
  if (anchoredEnd && cursor !== path.length) return false;
  return true;
}

export async function getRobotsPolicy(url: string, userAgent: string): Promise<RobotsPolicy> {
  const origin = new URL(url).origin;
  const key = `${origin}::${userAgent}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = (async (): Promise<RobotsPolicy> => {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { "user-agent": userAgent, accept: "text/plain" },
        signal: AbortSignal.timeout(10_000),
        redirect: "follow",
      });
      // 4xx is the documented "crawl freely" case; 5xx we treat the same way
      // rather than blocking a run on a flaky robots endpoint.
      if (!response.ok) return { rules: [], crawlDelayMs: null, source: "missing" };
      return parseRobots(await response.text(), userAgent);
    } catch {
      return { rules: [], crawlDelayMs: null, source: "error" };
    }
  })();

  cache.set(key, pending);
  return pending;
}

/** Longest matching rule wins; `Allow` wins ties. */
export function isAllowedByPolicy(policy: RobotsPolicy, url: string): boolean {
  const { pathname, search } = new URL(url);
  const path = `${pathname}${search}`;

  let decision = true;
  let bestLength = -1;
  for (const rule of policy.rules) {
    if (!matchesPattern(rule.path, path)) continue;
    const length = rule.path.length;
    if (length > bestLength || (length === bestLength && rule.allow)) {
      bestLength = length;
      decision = rule.allow;
    }
  }
  return decision;
}

export async function isAllowed(url: string, userAgent: string): Promise<boolean> {
  return isAllowedByPolicy(await getRobotsPolicy(url, userAgent), url);
}

/** Exposed for tests. */
export const __internal = { parseRobots, matchesPattern };

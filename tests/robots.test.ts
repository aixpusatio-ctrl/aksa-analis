import { describe, expect, test } from "bun:test";
import { __internal, isAllowedByPolicy, type RobotsPolicy } from "../apps/server/scraper/robots.ts";

const { parseRobots, matchesPattern } = __internal;
const policyFor = (text: string, ua = "my-bot"): RobotsPolicy => parseRobots(text, ua);
const allows = (text: string, url: string, ua = "my-bot") => isAllowedByPolicy(policyFor(text, ua), url);

describe("robots.txt parsing", () => {
  test("an empty file allows everything", () => {
    expect(allows("", "https://x.com/anything")).toBe(true);
  });

  test("Disallow blocks a prefix", () => {
    const txt = "User-agent: *\nDisallow: /private";
    expect(allows(txt, "https://x.com/private/page")).toBe(false);
    expect(allows(txt, "https://x.com/public")).toBe(true);
  });

  test("Disallow: / blocks the whole site", () => {
    expect(allows("User-agent: *\nDisallow: /", "https://x.com/")).toBe(false);
  });

  test("an empty Disallow value blocks nothing", () => {
    expect(allows("User-agent: *\nDisallow:", "https://x.com/anything")).toBe(true);
  });

  test("the longest matching rule wins, so Allow can carve out an exception", () => {
    const txt = "User-agent: *\nDisallow: /data\nAllow: /data/public";
    expect(allows(txt, "https://x.com/data/secret")).toBe(false);
    expect(allows(txt, "https://x.com/data/public/a")).toBe(true);
  });

  test("a group naming our user agent beats the wildcard group", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: my-bot\nDisallow: /admin";
    expect(allows(txt, "https://x.com/anything")).toBe(true);
    expect(allows(txt, "https://x.com/admin")).toBe(false);
  });

  test("consecutive User-agent lines share one rule block", () => {
    const txt = "User-agent: my-bot\nUser-agent: other-bot\nDisallow: /x";
    expect(allows(txt, "https://x.com/x")).toBe(false);
    expect(allows(txt, "https://x.com/y")).toBe(true);
  });

  test("comments and blank lines are ignored", () => {
    const txt = "# a comment\n\nUser-agent: *   # trailing\nDisallow: /no   # here too\n";
    expect(allows(txt, "https://x.com/no")).toBe(false);
    expect(allows(txt, "https://x.com/yes")).toBe(true);
  });

  test("Crawl-delay is read in seconds and reported in milliseconds", () => {
    expect(policyFor("User-agent: *\nCrawl-delay: 2.5").crawlDelayMs).toBe(2500);
    expect(policyFor("User-agent: *").crawlDelayMs).toBeNull();
  });

  test("the query string is part of the matched path", () => {
    expect(allows("User-agent: *\nDisallow: /s?q=", "https://x.com/s?q=1")).toBe(false);
    expect(allows("User-agent: *\nDisallow: /s?q=", "https://x.com/s")).toBe(true);
  });
});

describe("robots.txt wildcard patterns", () => {
  test("* matches any run of characters", () => {
    expect(matchesPattern("/a/*/c", "/a/b/c")).toBe(true);
    expect(matchesPattern("/a/*/c", "/a/b/d")).toBe(false);
    expect(matchesPattern("/*.pdf", "/docs/file.pdf")).toBe(true);
  });

  test("$ anchors the end of the path", () => {
    expect(matchesPattern("/a$", "/a")).toBe(true);
    expect(matchesPattern("/a$", "/ab")).toBe(false);
  });

  test("an empty pattern never matches", () => {
    expect(matchesPattern("", "/anything")).toBe(false);
  });
});

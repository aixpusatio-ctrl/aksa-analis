import { describe, expect, test } from "bun:test";
import { normalizeConfig } from "../apps/server/services/scraper-service.ts";
import { HttpError } from "../apps/server/utils/errors.ts";
import { clampInt, asBool, oneOf, assertHttpUrl } from "../apps/server/utils/validate.ts";

const base = {
  url: "https://example.com/products",
  fields: [{ name: "title", selector: "h2", type: "text" as const }],
};

const expectBadRequest = (fn: () => unknown, match: RegExp) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(400);
    expect((error as HttpError).message).toMatch(match);
    return;
  }
  throw new Error("expected the call to throw");
};

describe("validation helpers", () => {
  test("clampInt keeps values inside the range", () => {
    expect(clampInt(5, { min: 1, max: 10 }, 3)).toBe(5);
    expect(clampInt(99, { min: 1, max: 10 }, 3)).toBe(10);
    expect(clampInt(-5, { min: 1, max: 10 }, 3)).toBe(1);
    expect(clampInt("nonsense", { min: 1, max: 10 }, 3)).toBe(3);
    expect(clampInt(undefined, { min: 1, max: 10 }, 3)).toBe(3);
  });

  test("asBool accepts the usual truthy spellings", () => {
    expect(asBool(true, false)).toBe(true);
    expect(asBool("true", false)).toBe(true);
    expect(asBool(1, false)).toBe(true);
    expect(asBool("0", true)).toBe(false);
    expect(asBool(null, true)).toBe(true);
  });

  test("oneOf falls back when the value is not allowed", () => {
    expect(oneOf("css", ["css", "xpath"] as const, "xpath")).toBe("css");
    expect(oneOf("nope", ["css", "xpath"] as const, "xpath")).toBe("xpath");
  });

  test("assertHttpUrl rejects non-http schemes", () => {
    expect(assertHttpUrl("https://x.com")).toBe("https://x.com/");
    expectBadRequest(() => assertHttpUrl("file:///etc/passwd"), /must use http or https/);
    expectBadRequest(() => assertHttpUrl("javascript:alert(1)"), /must use http or https/);
    expectBadRequest(() => assertHttpUrl("not a url"), /not a valid URL/);
  });
});

describe("normalizeConfig", () => {
  test("fills defaults and derives a name from the host", () => {
    const config = normalizeConfig(base);
    expect(config.name).toBe("example.com");
    expect(config.itemSelectorKind).toBe("css");
    expect(config.pagination.mode).toBe("none");
    expect(config.fields[0]!.trim).toBe(true);
    expect(config.fields[0]!.id).toBeString();
  });

  test("clamps out-of-range numbers instead of trusting the payload", () => {
    const config = normalizeConfig({ ...base, maxPages: 999_999, timeoutMs: 1, requestDelayMs: -5 });
    expect(config.maxPages).toBeLessThanOrEqual(1000);
    expect(config.timeoutMs).toBeGreaterThanOrEqual(1000);
    expect(config.requestDelayMs).toBe(0);
  });

  test("requires at least one field", () => {
    expectBadRequest(() => normalizeConfig({ ...base, fields: [] }), /at least one field/);
  });

  test("rejects duplicate field names, which would collide as columns", () => {
    expectBadRequest(
      () =>
        normalizeConfig({
          ...base,
          fields: [
            { name: "a", selector: "h1", type: "text" },
            { name: "a", selector: "h2", type: "text" },
          ],
        }),
      /Duplicate field name/,
    );
  });

  test("rejects an unnamed field", () => {
    expectBadRequest(() => normalizeConfig({ ...base, fields: [{ name: "", selector: "h1" }] }), /needs a name/);
  });

  test("rejects a field name that would not survive a CSV header", () => {
    expectBadRequest(() => normalizeConfig({ ...base, fields: [{ name: "a,b", selector: "h1" }] }), /may only contain/);
  });

  test('requires an attribute name for type "attribute"', () => {
    expectBadRequest(
      () => normalizeConfig({ ...base, fields: [{ name: "sku", selector: "div", type: "attribute" }] }),
      /attribute name/,
    );
    const ok = normalizeConfig({
      ...base,
      fields: [{ name: "sku", selector: "div", type: "attribute", attribute: "data-sku" }],
    });
    expect(ok.fields[0]!.attribute).toBe("data-sku");
  });

  test("url-pattern pagination needs a {page} placeholder", () => {
    expectBadRequest(
      () => normalizeConfig({ ...base, pagination: { mode: "url-pattern", urlPattern: "https://x.com/p" } }),
      /\{page\}/,
    );
    const ok = normalizeConfig({
      ...base,
      pagination: { mode: "url-pattern", urlPattern: "https://x.com/p?page={page}" },
    });
    expect(ok.pagination.urlPattern).toBe("https://x.com/p?page={page}");
  });

  test("selector pagination needs a next-page selector", () => {
    expectBadRequest(() => normalizeConfig({ ...base, pagination: { mode: "selector" } }), /next-page element/);
  });

  test("an unknown field type falls back to text rather than failing the run", () => {
    const config = normalizeConfig({ ...base, fields: [{ name: "x", selector: "h1", type: "bogus" as never }] });
    expect(config.fields[0]!.type).toBe("text");
  });
});

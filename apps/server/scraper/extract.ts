import type { Page } from "playwright-core";
import type { FieldConfig, SelectorKind } from "@shared/types.ts";

export interface ExtractionPlan {
  itemSelector: string;
  itemSelectorKind: SelectorKind;
  fields: FieldConfig[];
}

export interface ExtractionOutcome {
  items: Record<string, unknown>[];
  /** Items matched before `required` fields filtered any out. */
  matched: number;
  /** Selector problems worth surfacing in the log, keyed by field name. */
  warnings: string[];
}

/**
 * The extraction routine, serialized into the page by `page.evaluate`.
 *
 * It has to be completely self-contained: Playwright stringifies this function
 * and runs it in the browser, so it cannot close over anything from the module.
 */
function extractInPage(plan: ExtractionPlan): ExtractionOutcome {
  const warnings: string[] = [];

  const absolute = (value: string | null): string | null => {
    if (!value) return value;
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return value;
    }
  };

  const normalizeXPath = (expression: string, scoped: boolean): string => {
    if (!scoped) return expression;
    // A scoped query with an absolute path would escape the item element, so
    // rewrite `//x` and `/x` into the relative `.//x` / `./x` form.
    if (expression.startsWith(".")) return expression;
    if (expression.startsWith("//")) return `.${expression}`;
    if (expression.startsWith("/")) return `.${expression}`;
    return expression;
  };

  const queryXPath = (expression: string, context: Node, scoped: boolean): Element[] => {
    const out: Element[] = [];
    const result = document.evaluate(
      normalizeXPath(expression, scoped),
      context,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (node && node.nodeType === Node.ELEMENT_NODE) out.push(node as Element);
      else if (node && node.nodeType === Node.ATTRIBUTE_NODE) {
        // `@href` style expressions: wrap the value in a stand-in element so
        // the field readers below have something uniform to work with.
        const holder = document.createElement("span");
        holder.textContent = node.nodeValue ?? "";
        out.push(holder);
      }
    }
    return out;
  };

  const query = (selector: string, kind: SelectorKind, context: Element | Document, scoped: boolean): Element[] => {
    if (!selector) return context instanceof Element ? [context] : [];
    try {
      if (kind === "xpath") return queryXPath(selector, context, scoped);
      return Array.from(context.querySelectorAll(selector));
    } catch (error) {
      warnings.push(`selector "${selector}" is invalid: ${(error as Error).message}`);
      return [];
    }
  };

  const squash = (value: string): string => value.replace(/\s+/g, " ").trim();

  const readText = (element: Element): string => {
    const inner = (element as HTMLElement).innerText;
    return inner && inner.trim() ? inner : (element.textContent ?? "");
  };

  const readImage = (element: Element): string | null => {
    const direct =
      element.getAttribute("src") ??
      element.getAttribute("data-src") ??
      element.getAttribute("data-original") ??
      element.getAttribute("data-lazy-src");
    if (direct) return absolute(direct);

    const srcset = element.getAttribute("srcset") ?? element.getAttribute("data-srcset");
    if (srcset) {
      const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
      if (first) return absolute(first);
    }

    const nested = element.querySelector("img");
    if (nested && nested !== element) return readImage(nested);

    // CSS background images are a common lazy-loading pattern.
    const background = getComputedStyle(element).backgroundImage;
    const match = background && background !== "none" ? /url\(["']?(.*?)["']?\)/.exec(background) : null;
    return match?.[1] ? absolute(match[1]) : null;
  };

  const readValue = (element: Element, field: FieldConfig): string | null => {
    switch (field.type) {
      case "text":
        return readText(element);
      case "html":
        return element.innerHTML;
      case "link": {
        const anchor = element.matches("a[href]") ? element : element.querySelector("a[href]") ?? element.closest("a[href]");
        return absolute(anchor?.getAttribute("href") ?? element.getAttribute("href") ?? null);
      }
      case "image":
        return readImage(element);
      case "title":
        return (
          element.getAttribute("title") ??
          element.getAttribute("aria-label") ??
          element.getAttribute("alt") ??
          readText(element)
        );
      case "attribute": {
        const name = field.attribute ?? "";
        if (!name) {
          warnings.push(`field "${field.name}" is set to "attribute" but no attribute name was given`);
          return null;
        }
        const raw = element.getAttribute(name);
        return name === "href" || name === "src" || name === "srcset" ? absolute(raw) : raw;
      }
      default:
        return readText(element);
    }
  };

  const containers: (Element | Document)[] = plan.itemSelector
    ? query(plan.itemSelector, plan.itemSelectorKind, document, false)
    : [document];

  const items: Record<string, unknown>[] = [];

  for (const container of containers) {
    const row: Record<string, unknown> = {};
    let dropped = false;

    for (const field of plan.fields) {
      if (!field.name) continue;
      const scoped = container instanceof Element;
      const matches = query(field.selector, field.selectorKind, container, scoped);
      const trim = field.trim !== false;

      const values = matches
        .map((element) => readValue(element, field))
        .map((value) => (value === null ? null : trim ? squash(value) : value))
        .filter((value): value is string => value !== null && value !== "");

      if (field.multiple) {
        row[field.name] = values;
        if (field.required && values.length === 0) dropped = true;
      } else {
        const first = values[0] ?? null;
        row[field.name] = first;
        if (field.required && first === null) dropped = true;
      }
    }

    if (!dropped) items.push(row);
  }

  return { items, matched: containers.length, warnings: Array.from(new Set(warnings)) };
}

/** Run the extraction plan against a live page. */
export function extractFromPage(page: Page, plan: ExtractionPlan): Promise<ExtractionOutcome> {
  return page.evaluate(extractInPage, plan);
}

/**
 * Count the elements a selector matches without extracting anything — used to
 * validate a configuration before a long run and to power "Test selector".
 */
export function countMatches(page: Page, selector: string, kind: SelectorKind): Promise<number> {
  return page.evaluate(
    ({ selector, kind }: { selector: string; kind: SelectorKind }) => {
      if (!selector) return 1;
      try {
        if (kind === "xpath") {
          const result = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          return result.snapshotLength;
        }
        return document.querySelectorAll(selector).length;
      } catch {
        return -1;
      }
    },
    { selector, kind },
  );
}

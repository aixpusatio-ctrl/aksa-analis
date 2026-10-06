import type { Page } from "playwright-core";
import type { FieldType } from "@shared/types.ts";

export interface DetectedField {
  name: string;
  selector: string;
  type: FieldType;
  attribute?: string;
  /** 0–1; how sure the detector is that this field is meaningful. */
  confidence: number;
  samples: string[];
}

export interface DetectedSchema {
  itemSelector: string;
  itemCount: number;
  confidence: number;
  fields: DetectedField[];
  /** Other repeated structures worth offering as alternatives. */
  alternatives: { selector: string; count: number; score: number }[];
}

/**
 * Looks for the repeated structure on a page and guesses what each part of it
 * means, so a user can start from a filled-in schema instead of a blank form.
 *
 * Runs entirely in the page: it needs layout and computed styles, and the DOM
 * is the only place those exist.
 */
export function detectSchema(page: Page, options: { maxFields?: number } = {}): Promise<DetectedSchema | null> {
  return page.evaluate((config: { maxFields: number }) => {
    const isStableClass = (name: string): boolean =>
      !!name &&
      name.length <= 40 &&
      !name.startsWith("__aksa") &&
      !/^(is-|has-|js-)/.test(name) &&
      !/(active|open|selected|hover|focus|hidden|current|disabled)$/i.test(name) &&
      !/[0-9a-f]{6,}/i.test(name) &&
      !/^\d/.test(name) &&
      /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);

    const classesOf = (el: Element): string[] => Array.from(el.classList).filter(isStableClass);

    const signatureOf = (el: Element): string => `${el.tagName}|${classesOf(el).sort().join(".")}`;

    const textOf = (el: Element): string =>
      ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();

    const escape = (value: string): string =>
      window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/([^\w-])/g, "\\$&");

    const count = (selector: string): number => {
      try {
        return document.querySelectorAll(selector).length;
      } catch {
        return 0;
      }
    };

    /* -------------------------------------------------------------- */
    /* 1. Find groups of repeated siblings                            */
    /* -------------------------------------------------------------- */

    interface Group {
      selector: string;
      elements: Element[];
      score: number;
    }

    const groups: Group[] = [];
    const seenSelectors = new Set<string>();

    for (const parent of Array.from(document.querySelectorAll("body *"))) {
      const children = Array.from(parent.children);
      if (children.length < 3) continue;

      const bySignature = new Map<string, Element[]>();
      for (const child of children) {
        const signature = signatureOf(child);
        const bucket = bySignature.get(signature);
        if (bucket) bucket.push(child);
        else bySignature.set(signature, [child]);
      }

      for (const [, members] of bySignature) {
        if (members.length < 3) continue;
        const sample = members[0]!;
        const classes = classesOf(sample);

        // Prefer a class-based selector; fall back to the parent > tag shape.
        let selector = "";
        if (classes.length > 0) {
          const byClass = `${sample.tagName.toLowerCase()}.${escape(classes[0]!)}`;
          if (count(byClass) >= members.length) selector = byClass;
        }
        if (!selector) {
          const parentClasses = classesOf(parent);
          selector = parentClasses.length
            ? `.${escape(parentClasses[0]!)} > ${sample.tagName.toLowerCase()}`
            : sample.tagName.toLowerCase();
        }
        if (seenSelectors.has(selector)) continue;
        seenSelectors.add(selector);

        // Score on how much each member actually contains: a list of records
        // has several text-bearing descendants, a nav bar has one link.
        let textyChildren = 0;
        let withLink = 0;
        let withImage = 0;
        let totalText = 0;
        for (const member of members) {
          const descendants = Array.from(member.querySelectorAll("*"));
          textyChildren += descendants.filter((d) => d.children.length === 0 && textOf(d).length > 0).length;
          if (member.querySelector("a[href]")) withLink++;
          if (member.querySelector("img")) withImage++;
          totalText += textOf(member).length;
        }

        const averageTexty = textyChildren / members.length;
        const averageText = totalText / members.length;
        if (averageTexty < 2 || averageText < 12) continue;

        const rect = sample.getBoundingClientRect();
        const area = rect.width * rect.height;

        const score =
          Math.min(members.length, 40) * 2 +
          averageTexty * 6 +
          (withLink / members.length) * 10 +
          (withImage / members.length) * 8 +
          Math.min(averageText, 300) / 20 +
          (area > 400 ? 6 : 0);

        groups.push({ selector, elements: members, score });
      }
    }

    if (groups.length === 0) return null;
    groups.sort((a, b) => b.score - a.score);

    const best = groups[0]!;
    const items = best.elements;

    /* -------------------------------------------------------------- */
    /* 2. Work out what the parts of one item mean                    */
    /* -------------------------------------------------------------- */

    const PRICE = /(?:rp|idr|usd|eur|gbp|\$|€|£|¥)\s?[\d.,]{2,}|\b[\d.,]{3,}\s?(?:rp|idr|usd|k|jt|juta|rb|ribu)\b/i;
    const DATE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|mei|jun|jul|aug|agu|sep|oct|okt|nov|dec|des)[a-z]*\.?\s+\d{4})\b/i;
    const RATING = /(?:★|⭐|rating|rated)|^\s*[0-5](?:[.,]\d)?\s*(?:\/\s*5|out of 5|stars?|bintang)?\s*$/i;

    const relativeSelector = (el: Element, item: Element): string => {
      const classes = classesOf(el);
      for (const className of classes) {
        const candidate = `.${escape(className)}`;
        try {
          if (item.querySelectorAll(candidate).length >= 1) return candidate;
        } catch {
          /* unusable class */
        }
      }
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== item) {
        let part = node.tagName.toLowerCase();
        const own = classesOf(node);
        if (own.length) part += `.${own.slice(0, 2).map(escape).join(".")}`;
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(" > ");
    };

    /** How many of the items produce a non-empty value for this selector. */
    const coverage = (selector: string, read: (el: Element) => string | null): { hits: number; samples: string[] } => {
      let hits = 0;
      const samples: string[] = [];
      for (const item of items.slice(0, 12)) {
        let value: string | null = null;
        try {
          const found = selector ? item.querySelector(selector) : item;
          value = found ? read(found) : null;
        } catch {
          value = null;
        }
        if (value) {
          hits++;
          if (samples.length < 3) samples.push(value.slice(0, 80));
        }
      }
      return { hits, samples };
    };

    const probe = items.slice(0, 6);
    const candidates: {
      selector: string;
      type: FieldType;
      attribute?: string;
      name: string;
      priority: number;
    }[] = [];
    const takenSelectors = new Set<string>();
    const takenNames = new Set<string>();

    const pushCandidate = (
      el: Element,
      item: Element,
      type: FieldType,
      name: string,
      priority: number,
      attribute?: string,
    ) => {
      const selector = relativeSelector(el, item);
      const key = `${selector}::${type}::${attribute ?? ""}`;
      if (takenSelectors.has(key)) return;
      takenSelectors.add(key);
      let unique = name;
      let suffix = 2;
      while (takenNames.has(unique)) unique = `${name}_${suffix++}`;
      takenNames.add(unique);
      candidates.push({ selector, type, name: unique, priority, ...(attribute ? { attribute } : {}) });
    };

    const reference = probe[0]!;

    // Headings first — they are almost always the record's title.
    const heading = reference.querySelector("h1, h2, h3, h4, h5, h6, [class*='title'], [class*='name'], [class*='judul']");
    if (heading && textOf(heading)) pushCandidate(heading, reference, "text", "title", 100);

    for (const el of Array.from(reference.querySelectorAll("*"))) {
      if (el.children.length > 0 && el.tagName.toLowerCase() !== "a") continue;
      const text = textOf(el);
      const tag = el.tagName.toLowerCase();

      if (tag === "time" || (text && DATE.test(text))) {
        pushCandidate(el, reference, el.hasAttribute("datetime") ? "attribute" : "text", "date", 80, el.hasAttribute("datetime") ? "datetime" : undefined);
        continue;
      }
      if (text && PRICE.test(text)) {
        pushCandidate(el, reference, "text", "price", 90);
        continue;
      }
      if (text && text.length < 24 && RATING.test(text)) {
        pushCandidate(el, reference, "text", "rating", 60);
        continue;
      }
      if (text && text.length >= 2 && text.length <= 300) {
        const className = classesOf(el)[0];
        const name = className ? className.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase() : tag;
        pushCandidate(el, reference, "text", name || "text", text.length > 60 ? 30 : 40);
      }
    }

    const image = reference.querySelector("img, picture");
    if (image) pushCandidate(image, reference, "image", "image", 85);

    const link = reference.querySelector("a[href]");
    if (link) pushCandidate(link, reference, "link", "url", 85);

    // Data attributes on the item itself are usually stable identifiers.
    for (const attribute of Array.from(reference.attributes)) {
      if (!attribute.name.startsWith("data-") || attribute.name === "data-aksa-ref") continue;
      const name = attribute.name.replace(/^data-/, "").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();
      pushCandidate(reference, reference, "attribute", name, 70, attribute.name);
    }

    /* -------------------------------------------------------------- */
    /* 3. Keep only the fields that actually hold up across items      */
    /* -------------------------------------------------------------- */

    const readFor = (type: FieldType, attribute?: string) => (el: Element): string | null => {
      if (type === "link") {
        const a = el.matches("a[href]") ? el : el.querySelector("a[href]");
        const href = a?.getAttribute("href");
        return href ? new URL(href, document.baseURI).href : null;
      }
      if (type === "image") {
        const img = el.tagName.toLowerCase() === "img" ? el : el.querySelector("img");
        const src = img?.getAttribute("src") ?? img?.getAttribute("data-src");
        return src ? new URL(src, document.baseURI).href : null;
      }
      if (type === "attribute") return attribute ? el.getAttribute(attribute) : null;
      return textOf(el) || null;
    };

    const fields: DetectedField[] = [];
    for (const candidate of candidates.sort((a, b) => b.priority - a.priority)) {
      if (fields.length >= config.maxFields) break;
      const { hits, samples } = coverage(candidate.selector, readFor(candidate.type, candidate.attribute));
      const checked = Math.min(items.length, 12);
      const ratio = checked > 0 ? hits / checked : 0;
      // A field present in only a couple of records is noise, not a column.
      if (ratio < 0.4) continue;
      fields.push({
        name: candidate.name,
        selector: candidate.selector,
        type: candidate.type,
        ...(candidate.attribute ? { attribute: candidate.attribute } : {}),
        confidence: Math.round(Math.min(1, ratio * (candidate.priority / 100) + ratio * 0.35) * 100) / 100,
        samples,
      });
    }

    const maxScore = groups[0]!.score;
    return {
      itemSelector: best.selector,
      itemCount: count(best.selector) || items.length,
      confidence: Math.round(Math.min(1, (fields.length >= 2 ? 0.55 : 0.3) + Math.min(items.length, 20) / 50) * 100) / 100,
      fields,
      alternatives: groups.slice(1, 5).map((group) => ({
        selector: group.selector,
        count: count(group.selector) || group.elements.length,
        score: Math.round((group.score / maxScore) * 100) / 100,
      })),
    };
  }, { maxFields: options.maxFields ?? 12 });
}

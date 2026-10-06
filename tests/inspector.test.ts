import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { browserManager } from "../apps/server/scraper/browser.ts";
import { serializeDocument } from "../apps/server/inspector/serialize.ts";
import { detectSchema } from "../apps/server/inspector/detect.ts";
import { PICKER_SCRIPT } from "../apps/server/inspector/picker-script.ts";
import type { PickedElement } from "../packages/shared/types.ts";

/** A page shaped like a real listing: repeated records, prices, dates, links. */
const SHOP = `<!doctype html><html><head><base href="https://shop.test/catalog/"><title>Catalog</title>
<style>.product{display:block}</style></head><body>
<nav class="menu"><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></nav>
<div class="grid">
  ${Array.from({ length: 6 }, (_, i) => {
    const n = i + 1;
    return `<article class="product" data-sku="SKU-${n}" data-stock="${n * 3}">
      <a href="p/${n}"><img src="img/${n}.png" alt="Item ${n}"></a>
      <h3 class="product-name">Widget ${n}</h3>
      <span class="product-brand">Brand ${n}</span>
      <span class="product-price">Rp ${n}50.000</span>
      <time class="product-date" datetime="2026-0${n}-15">0${n} Jan 2026</time>
      <span class="product-rating">4.${n}</span>
    </article>`;
  }).join("")}
</div>
<footer><p>© 2026</p></footer>
</body></html>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await browserManager.browser();
  page = await (await browser.newContext()).newPage();
  await page.setContent(SHOP);
});

afterAll(async () => {
  await browserManager.close();
});

describe("snapshot serialization", () => {
  test("stamps every element with a ref the picker can address", async () => {
    const result = await page.evaluate(serializeDocument);
    expect(result.elementCount).toBeGreaterThan(30);
    expect(result.html).toContain("data-aksa-ref");
    expect(result.title).toBe("Catalog");
  });

  test("resolves relative URLs against the page, so the preview is not broken", async () => {
    const result = await page.evaluate(serializeDocument);
    expect(result.html).toContain("https://shop.test/catalog/img/1.png");
    expect(result.html).toContain("https://shop.test/catalog/p/1");
  });

  test("strips scripts, so the snapshot is inert when we serve it", async () => {
    await page.setContent(
      `<html><body><p id="x">hi</p><script>window.__ran = true;</script>
       <div onclick="alert(1)">c</div><a href="javascript:alert(2)">bad</a></body></html>`,
    );
    const result = await page.evaluate(serializeDocument);

    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("window.__ran");
    expect(result.html).not.toContain("onclick");
    expect(result.html).not.toContain("javascript:alert");

    await page.setContent(SHOP);
  });

  test("keeps stylesheets so the preview still looks like the real page", async () => {
    await page.setContent(
      `<html><head><link rel="stylesheet" href="/style.css"><style>.a{color:red}</style></head><body><p class="a">x</p></body></html>`,
    );
    const result = await page.evaluate(serializeDocument);
    expect(result.html).toContain("stylesheet");
    expect(result.html).toContain(".a{color:red}");
    await page.setContent(SHOP);
  });

  test("points links at a new tab so the preview cannot navigate away", async () => {
    const result = await page.evaluate(serializeDocument);
    expect(result.html).toContain('target="_blank"');
  });
});

describe("auto detection", () => {
  test("finds the repeating record, not the nav bar", async () => {
    const schema = await detectSchema(page);
    expect(schema).not.toBeNull();
    expect(schema!.itemSelector).toContain("product");
    expect(schema!.itemCount).toBe(6);
  });

  test("names the obvious fields and gets their types right", async () => {
    const schema = await detectSchema(page);
    const byName = new Map(schema!.fields.map((field) => [field.name, field]));

    expect(byName.has("title")).toBe(true);
    expect(byName.get("title")!.selector).toContain("product-name");

    expect(byName.has("price")).toBe(true);
    expect(byName.get("price")!.selector).toContain("product-price");

    expect(byName.get("image")?.type).toBe("image");
    expect(byName.get("url")?.type).toBe("link");

    // A <time datetime> is read from the attribute, not the rendered text.
    expect(byName.get("date")?.type).toBe("attribute");
    expect(byName.get("date")?.attribute).toBe("datetime");
  });

  test("picks up data attributes on the item itself", async () => {
    const schema = await detectSchema(page);
    const sku = schema!.fields.find((field) => field.attribute === "data-sku");
    expect(sku).toBeDefined();
    expect(sku!.type).toBe("attribute");
    expect(sku!.selector).toBe("");
  });

  test("reports samples and a confidence per field", async () => {
    const schema = await detectSchema(page);
    const title = schema!.fields.find((field) => field.name === "title")!;
    expect(title.samples[0]).toBe("Widget 1");
    expect(title.confidence).toBeGreaterThan(0.5);
  });

  test("returns null when the page has no repeating structure", async () => {
    await page.setContent(`<html><body><h1>Just a heading</h1><p>and one paragraph</p></body></html>`);
    expect(await detectSchema(page)).toBeNull();
    await page.setContent(SHOP);
  });
});

describe("selector generation in the picker", () => {
  // Its own page, with the picker injected once: these tests must not depend
  // on what any earlier test left in the shared page.
  let pickerPage: Page;

  beforeAll(async () => {
    pickerPage = await (await browser.newContext()).newPage();
    await pickerPage.setContent(SHOP);
    await pickerPage.evaluate(PICKER_SCRIPT);
  });

  /** Ask the picker in the page to describe an element. */
  async function describeElement(selector: string): Promise<PickedElement> {
    const exists = await pickerPage.evaluate((target: string) => !!document.querySelector(target), selector);
    if (!exists) throw new Error(`The fixture has no element matching ${selector}`);

    return pickerPage.evaluate((target: string) => {
      const element = document.querySelector(target)!;
      return new Promise<PickedElement>((resolve) => {
        const onMessage = (event: MessageEvent) => {
          if (event.data?.source === "aksa-picker" && event.data.type === "picked") {
            window.removeEventListener("message", onMessage);
            resolve(event.data.element as PickedElement);
          }
        };
        window.addEventListener("message", onMessage);
        // Must be cancelable: the picker calls preventDefault() to stop a click
        // on a link from navigating, and a non-cancelable event ignores that.
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    }, selector);
  }

  test("offers a selector for one element and one for all siblings", async () => {
    const picked = await describeElement(".product-name");
    expect(picked.countExact).toBe(1);
    expect(picked.countAll).toBe(6);
    expect(picked.cssAll).toContain("product-name");
  });

  test("spots the repeating ancestor and a selector relative to it", async () => {
    const picked = await describeElement(".product-price");
    expect(picked.itemCandidate).not.toBeNull();
    expect(picked.itemCandidate!.count).toBe(6);
    expect(picked.itemCandidate!.selector).toContain("product");
    expect(picked.itemCandidate!.relative).toContain("product-price");
  });

  test("suggests a type from the element itself", async () => {
    expect((await describeElement(".product img")).suggestedType).toBe("image");
    expect((await describeElement(".product a")).suggestedType).toBe("link");
    expect((await describeElement(".product-name")).suggestedType).toBe("text");
  });

  test("produces a usable XPath as well as CSS", async () => {
    const picked = await describeElement(".product-name");
    expect(picked.xpathAll).toContain("product-name");

    const count = await pickerPage.evaluate((expression: string) => {
      const result = document.evaluate(expression, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return result.snapshotLength;
    }, picked.xpathAll);
    expect(count).toBe(6);
  });

  test("reads a preview value the way the extractor would", async () => {
    const picked = await describeElement(".product-name");
    expect(picked.preview).toBe("Widget 1");

    const image = await describeElement(".product img");
    expect(image.preview).toBe("https://shop.test/catalog/img/1.png");
  });

  test("every generated selector actually resolves", async () => {
    for (const target of [".product-name", ".product-price", ".product img", ".product"]) {
      const picked = await describeElement(target);
      const counts = await pickerPage.evaluate(
        ({ exact, all }: { exact: string; all: string }) => ({
          exact: document.querySelectorAll(exact).length,
          all: document.querySelectorAll(all).length,
        }),
        { exact: picked.css, all: picked.cssAll },
      );
      expect(counts.exact).toBe(1);
      expect(counts.all).toBeGreaterThanOrEqual(1);
    }
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright-core";
import { browserManager } from "../apps/server/scraper/browser.ts";
import { countMatches, extractFromPage } from "../apps/server/scraper/extract.ts";
import type { FieldConfig } from "../packages/shared/types.ts";

const HTML = `<!doctype html><html><head><base href="https://shop.example.com/catalog/">
<title>Catalog</title></head><body>
  <div class="product" data-sku="A-1">
    <span class="product-name">  Alpha   Widget </span>
    <span class="product-price">$9.99</span>
    <a href="../p/1">view</a>
    <img src="img/1.png" title="Alpha photo" alt="alt text">
    <span class="tag">new</span><span class="tag">sale</span>
  </div>
  <div class="product" data-sku="B-2">
    <span class="product-name">Beta Widget</span>
    <span class="product-price">$19.99</span>
    <a href="https://other.example.com/p/2">view</a>
    <img data-src="img/2.webp" alt="beta">
    <span class="tag">clearance</span>
  </div>
  <div class="product" data-sku="C-3">
    <span class="product-name">Gamma Widget</span>
    <a href="/p/3">view</a>
  </div>
</body></html>`;

const field = (overrides: Partial<FieldConfig> & Pick<FieldConfig, "name">): FieldConfig => ({
  id: overrides.name,
  selector: "",
  selectorKind: "css",
  type: "text",
  trim: true,
  ...overrides,
});

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await browserManager.browser();
  const context = await browser.newContext();
  page = await context.newPage();
  await page.setContent(HTML);
});

afterAll(async () => {
  await browserManager.close();
});

describe("field extraction", () => {
  test("text collapses whitespace when trim is on", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [field({ name: "name", selector: ".product-name" })],
    });
    expect(out.items.map((i) => i.name)).toEqual(["Alpha Widget", "Beta Widget", "Gamma Widget"]);
  });

  test("trim: false keeps the surrounding whitespace innerText reports", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [
        field({ name: "trimmed", selector: ".product-name" }),
        field({ name: "raw", selector: ".product-name", trim: false }),
      ],
    });
    expect(out.items[0]!.trimmed).toBe("Alpha Widget");
    // innerText is already collapsed by the browser, so what trim adds is the
    // removal of the leading/trailing run.
    expect(out.items[0]!.raw).toBe("Alpha Widget ");
  });

  test("link resolves relative hrefs against the document base", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [field({ name: "url", selector: "a", type: "link" })],
    });
    expect(out.items.map((i) => i.url)).toEqual([
      "https://shop.example.com/p/1",
      "https://other.example.com/p/2",
      "https://shop.example.com/p/3",
    ]);
  });

  test("image reads src, falls back to data-src, and resolves to absolute", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [field({ name: "image", selector: "img", type: "image" })],
    });
    expect(out.items[0]!.image).toBe("https://shop.example.com/catalog/img/1.png");
    expect(out.items[1]!.image).toBe("https://shop.example.com/catalog/img/2.webp");
    expect(out.items[2]!.image).toBeNull();
  });

  test("title prefers the title attribute, then aria-label, then alt", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [field({ name: "photo", selector: "img", type: "title" })],
    });
    expect(out.items[0]!.photo).toBe("Alpha photo");
    expect(out.items[1]!.photo).toBe("beta");
  });

  test("attribute reads an arbitrary attribute off the item itself", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [field({ name: "sku", selector: "", type: "attribute", attribute: "data-sku" })],
    });
    expect(out.items.map((i) => i.sku)).toEqual(["A-1", "B-2", "C-3"]);
  });

  test("multiple collects every match into an array", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [field({ name: "tags", selector: ".tag", multiple: true })],
    });
    expect(out.items[0]!.tags).toEqual(["new", "sale"]);
    expect(out.items[2]!.tags).toEqual([]);
  });

  test("required drops items where the field is missing", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [
        field({ name: "name", selector: ".product-name" }),
        field({ name: "price", selector: ".product-price", required: true }),
      ],
    });
    expect(out.matched).toBe(3);
    expect(out.items).toBeArrayOfSize(2);
    expect(out.items.map((i) => i.name)).toEqual(["Alpha Widget", "Beta Widget"]);
  });

  test("an empty item selector treats the page as one record", async () => {
    const out = await extractFromPage(page, {
      itemSelector: "",
      itemSelectorKind: "css",
      fields: [field({ name: "title", selector: "title" }), field({ name: "names", selector: ".product-name", multiple: true })],
    });
    expect(out.items).toBeArrayOfSize(1);
    expect(out.items[0]!.title).toBe("Catalog");
    expect(out.items[0]!.names).toBeArrayOfSize(3);
  });

  test("an invalid selector is reported as a warning, not a crash", async () => {
    const out = await extractFromPage(page, {
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [field({ name: "broken", selector: "[[[" })],
    });
    expect(out.warnings.join(" ")).toContain("is invalid");
    expect(out.items[0]!.broken).toBeNull();
  });
});

describe("XPath selectors", () => {
  test("an absolute XPath inside an item is rewritten to stay relative", async () => {
    const out = await extractFromPage(page, {
      itemSelector: "//div[@class='product']",
      itemSelectorKind: "xpath",
      fields: [field({ name: "name", selector: "//span[@class='product-name']", selectorKind: "xpath" })],
    });
    // Without the rewrite every row would hold "Alpha Widget".
    expect(out.items.map((i) => i.name)).toEqual(["Alpha Widget", "Beta Widget", "Gamma Widget"]);
  });

  test("an explicitly relative XPath works unchanged", async () => {
    const out = await extractFromPage(page, {
      itemSelector: "//div[@class='product']",
      itemSelectorKind: "xpath",
      fields: [field({ name: "price", selector: ".//span[@class='product-price']", selectorKind: "xpath" })],
    });
    expect(out.items.map((i) => i.price)).toEqual(["$9.99", "$19.99", null]);
  });
});

describe("countMatches", () => {
  test("counts CSS and XPath matches, and flags an invalid selector with -1", async () => {
    expect(await countMatches(page, ".product", "css")).toBe(3);
    expect(await countMatches(page, "//div[@class='product']", "xpath")).toBe(3);
    expect(await countMatches(page, ".nope", "css")).toBe(0);
    expect(await countMatches(page, "[[[", "css")).toBe(-1);
  });
});

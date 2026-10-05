import type { ScraperInput } from "@shared/types.ts";

export interface DemoPreset {
  id: string;
  title: string;
  summary: string;
  /** Page on the demo site this preset targets. */
  path: string;
  config: (base: string) => ScraperInput;
}

/**
 * Ready-made scraper configurations for the demo site.
 *
 * `bun run demo:seed` posts these into the app, and the README reproduces them
 * as a table so they can also be typed into the form by hand.
 */
export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "products-url-pattern",
    title: "Products — URL pattern pagination",
    summary:
      "The main example. Cards are rendered by JavaScript, so a plain HTTP fetch would come back empty. Walks pages with <code>?page={page}</code>.",
    path: "/products?page=1",
    config: (base) => ({
      name: "Demo · Products (URL pattern)",
      url: `${base}/products?page=1`,
      itemSelector: ".product",
      itemSelectorKind: "css",
      fields: [
        { id: "name", name: "name", selector: ".product-name", selectorKind: "css", type: "text" },
        { id: "brand", name: "brand", selector: ".product-brand", selectorKind: "css", type: "text" },
        { id: "price", name: "price", selector: ".product-price", selectorKind: "css", type: "text" },
        // Only every third product is discounted, so this column is often empty.
        { id: "old_price", name: "old_price", selector: ".product-old-price", selectorKind: "css", type: "text" },
        { id: "rating", name: "rating", selector: ".product-rating", selectorKind: "css", type: "text" },
        { id: "image", name: "image", selector: "img", selectorKind: "css", type: "image" },
        { id: "url", name: "url", selector: "a.product-link", selectorKind: "css", type: "link" },
        // An empty selector reads the attribute off the item element itself.
        { id: "sku", name: "sku", selector: "", selectorKind: "css", type: "attribute", attribute: "data-sku" },
        { id: "category", name: "category", selector: "", selectorKind: "css", type: "attribute", attribute: "data-category" },
        { id: "tags", name: "tags", selector: ".tag", selectorKind: "css", type: "text", multiple: true },
      ],
      pagination: {
        mode: "url-pattern",
        urlPattern: `${base}/products?page={page}`,
        startPage: 1,
        step: 1,
        stopWhenNoNewItems: true,
      },
      maxPages: 8,
      requestDelayMs: 300,
      timeoutMs: 20_000,
      // The grid is filled 250ms after load, so wait for a card before extracting.
      waitForSelector: ".product",
      waitUntil: "domcontentloaded",
    }),
  },

  {
    id: "products-next-button",
    title: "Products — click the next button",
    summary:
      "Same pages, reached by clicking <code>a.next</code> instead of building URLs. Use this when a site's page numbers are not in the URL.",
    path: "/products?page=1",
    config: (base) => ({
      name: "Demo · Products (next button)",
      url: `${base}/products?page=1`,
      itemSelector: ".product",
      fields: [
        { id: "name", name: "name", selector: ".product-name", selectorKind: "css", type: "text" },
        { id: "price", name: "price", selector: ".product-price", selectorKind: "css", type: "text" },
        { id: "url", name: "url", selector: "a.product-link", selectorKind: "css", type: "link" },
      ],
      pagination: { mode: "selector", nextSelector: "a.next", nextSelectorKind: "css", stopWhenNoNewItems: true },
      maxPages: 8,
      requestDelayMs: 300,
      timeoutMs: 20_000,
      waitForSelector: ".product",
    }),
  },

  {
    id: "catalog-scroll",
    title: "Catalog — infinite scroll",
    summary: "No pager at all: the list grows as you scroll. Each scroll round re-extracts, and duplicates are dropped.",
    path: "/catalog",
    config: (base) => ({
      name: "Demo · Catalog (infinite scroll)",
      url: `${base}/catalog`,
      itemSelector: ".product",
      fields: [
        { id: "name", name: "name", selector: ".product-name", selectorKind: "css", type: "text" },
        { id: "brand", name: "brand", selector: ".product-brand", selectorKind: "css", type: "text" },
        { id: "price", name: "price", selector: ".product-price", selectorKind: "css", type: "text" },
        { id: "image", name: "image", selector: "img", selectorKind: "css", type: "image" },
        { id: "sku", name: "sku", selector: "", selectorKind: "css", type: "attribute", attribute: "data-sku" },
      ],
      pagination: { mode: "scroll", scrollTimes: 10, scrollDelayMs: 500, stopWhenNoNewItems: true },
      maxPages: 12,
      requestDelayMs: 0,
      timeoutMs: 20_000,
      waitForSelector: ".product",
    }),
  },

  {
    id: "reviews",
    title: "Reviews — dates, two links, required field",
    summary:
      "A different record shape. The date comes from a <code>datetime</code> attribute, the rating from <code>data-rating</code>, and <code>author</code> is required so half-empty rows are dropped.",
    path: "/reviews?page=1",
    config: (base) => ({
      name: "Demo · Reviews",
      url: `${base}/reviews?page=1`,
      itemSelector: ".review",
      fields: [
        { id: "title", name: "title", selector: ".review-title", selectorKind: "css", type: "text" },
        { id: "author", name: "author", selector: ".review-author", selectorKind: "css", type: "text", required: true },
        { id: "author_url", name: "author_url", selector: ".review-author", selectorKind: "css", type: "link" },
        // The visible text is a star glyph; the attribute is the number we want.
        { id: "rating", name: "rating", selector: "", selectorKind: "css", type: "attribute", attribute: "data-rating" },
        { id: "date", name: "date", selector: ".review-date", selectorKind: "css", type: "attribute", attribute: "datetime" },
        { id: "product", name: "product", selector: ".review-product", selectorKind: "css", type: "text" },
        { id: "product_url", name: "product_url", selector: ".review-product", selectorKind: "css", type: "link" },
        { id: "body", name: "body", selector: ".review-body", selectorKind: "css", type: "text" },
        { id: "helpful", name: "helpful", selector: ".review-helpful", selectorKind: "css", type: "text" },
      ],
      pagination: { mode: "selector", nextSelector: "a.next", stopWhenNoNewItems: true },
      maxPages: 5,
      requestDelayMs: 400,
      timeoutMs: 20_000,
    }),
  },

  {
    id: "jobs-xpath",
    title: "Jobs — XPath selectors",
    summary:
      "A table instead of cards, scraped with XPath. Absolute paths like <code>//td[@class='job-title']</code> are rewritten to stay inside each row.",
    path: "/jobs",
    config: (base) => ({
      name: "Demo · Jobs (XPath)",
      url: `${base}/jobs`,
      itemSelector: "//tr[@class='job']",
      itemSelectorKind: "xpath",
      fields: [
        { id: "title", name: "title", selector: ".//td[@class='job-title']", selectorKind: "xpath", type: "text" },
        { id: "url", name: "url", selector: ".//td[@class='job-title']/a", selectorKind: "xpath", type: "link" },
        { id: "company", name: "company", selector: ".//td[@class='job-company']", selectorKind: "xpath", type: "text" },
        { id: "location", name: "location", selector: ".//td[@class='job-location']", selectorKind: "xpath", type: "text" },
        { id: "type", name: "type", selector: ".//td[@class='job-type']", selectorKind: "xpath", type: "text" },
        { id: "salary", name: "salary", selector: ".//td[@class='job-salary']", selectorKind: "xpath", type: "text" },
        { id: "skills", name: "skills", selector: ".//span[@class='skill']", selectorKind: "xpath", type: "text", multiple: true },
        { id: "posted", name: "posted", selector: ".//td[@class='job-posted']", selectorKind: "xpath", type: "text" },
        { id: "remote", name: "remote", selector: "", selectorKind: "css", type: "attribute", attribute: "data-remote" },
      ],
      pagination: { mode: "none" },
      maxPages: 1,
      timeoutMs: 20_000,
    }),
  },

  {
    id: "product-detail",
    title: "Product detail — whole page as one record",
    summary: "No item selector, so the page itself is the record and every field is read from the document.",
    path: "/product/7",
    config: (base) => ({
      name: "Demo · Product detail",
      url: `${base}/product/7`,
      itemSelector: "",
      fields: [
        { id: "name", name: "name", selector: ".detail-name", selectorKind: "css", type: "text" },
        { id: "brand", name: "brand", selector: ".detail-brand", selectorKind: "css", type: "text" },
        { id: "category", name: "category", selector: ".detail-category", selectorKind: "css", type: "text" },
        { id: "price", name: "price", selector: ".detail-price", selectorKind: "css", type: "text" },
        { id: "stock", name: "stock", selector: ".detail-stock", selectorKind: "css", type: "text" },
        { id: "sku", name: "sku", selector: ".detail-sku code", selectorKind: "css", type: "text" },
        { id: "image", name: "image", selector: "img", selectorKind: "css", type: "image" },
        { id: "colors", name: "colors", selector: ".detail-color", selectorKind: "css", type: "text", multiple: true },
        { id: "page_title", name: "page_title", selector: "title", selectorKind: "css", type: "text" },
      ],
      pagination: { mode: "none" },
      maxPages: 1,
      timeoutMs: 20_000,
    }),
  },
];

export const presetSummaries = DEMO_PRESETS.map(({ id, title, summary, path }) => ({ id, title, summary, path }));

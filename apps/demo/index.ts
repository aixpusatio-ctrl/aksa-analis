/**
 * A sample website, built to be scraped.
 *
 * Run it with `bun run demo`, then point the scraper at http://localhost:3100.
 * Every page exercises a different part of the engine — JavaScript rendering,
 * three pagination styles, attributes, XPath — and a few paths misbehave on
 * purpose so error handling can be seen working.
 */
import {
  adminPage,
  catalogPage,
  jobsPage,
  overviewPage,
  productDetailPage,
  productImage,
  productsPage,
  reviewsPage,
} from "./pages.ts";
import { presetSummaries } from "./presets.ts";
import { TOTAL_PAGES } from "./data.ts";

const PORT = Number.parseInt(process.env.DEMO_PORT ?? "3100", 10);

const html = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

const intParam = (request: Request, key: string, fallback: number): number => {
  const raw = new URL(request.url).searchParams.get(key);
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** `/flaky` fails this many times before it starts succeeding. */
let flakyFailuresLeft = 2;

const server = Bun.serve({
  port: PORT,
  idleTimeout: 0,

  routes: {
    "/": () => html(overviewPage(presetSummaries)),

    "/products": (req) => html(productsPage(Math.min(intParam(req, "page", 1), TOTAL_PAGES))),
    "/catalog": () => html(catalogPage()),
    "/reviews": (req) => html(reviewsPage(intParam(req, "page", 1))),
    "/jobs": () => html(jobsPage()),

    "/product/:id": (req) => {
      const id = Number.parseInt(req.params.id, 10);
      return html(productDetailPage(id), Number.isFinite(id) ? 200 : 404);
    },

    // Disallowed in robots.txt, so a polite scraper never reaches it.
    "/admin": () => html(adminPage()),

    "/robots.txt": () =>
      new Response(
        ["User-agent: *", "Disallow: /admin", "Disallow: /user/", "Allow: /", "Crawl-delay: 0", ""].join("\n"),
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      ),

    "/img/:file": (req) => {
      const id = Number.parseInt(req.params.file.replace(/\D/g, ""), 10) || 1;
      return new Response(productImage(id), {
        headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    },

    /* ---- pages that fail on purpose ---- */

    "/boom": () => new Response("Internal Server Error", { status: 500 }),

    "/flaky": () => {
      if (flakyFailuresLeft > 0) {
        flakyFailuresLeft--;
        return new Response(`Service unavailable (${flakyFailuresLeft} more failure(s) before it recovers)`, {
          status: 503,
        });
      }
      flakyFailuresLeft = 2; // reset, so the next run sees the same behaviour
      return html(`<h1 class="flaky-ok">Recovered</h1><p class="flaky-message">This request succeeded after retries.</p>`);
    },

    "/slow": async (req) => {
      const ms = Math.min(intParam(req, "ms", 5000), 60_000);
      await Bun.sleep(ms);
      return html(`<h1 class="slow-ok">Slow response</h1><p class="slow-delay">Waited ${ms} ms.</p>`);
    },

    "/*": () => html(`<h1>Not found</h1><p><a href="/">Back to the overview</a></p>`, 404),
  },
});

console.log(`
  Demo Shop is running
  ─────────────────────────────────────────────
  URL        http://localhost:${server.port}

  Products        /products?page=1   JavaScript-rendered, ${TOTAL_PAGES} pages
  Infinite scroll /catalog
  Reviews         /reviews?page=1
  Jobs            /jobs              static table, good for XPath
  Blocked         /admin             disallowed in robots.txt
  Flaky           /flaky             fails twice, then succeeds
  Slow            /slow?ms=5000

  Load the matching scraper configs with:  bun run demo:seed
`);

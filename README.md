# AKSA Analis

A visual web data extraction platform. Build a scraper by clicking elements on
the page, run it against JavaScript-heavy sites with Playwright, watch the log
stream in realtime, then browse and export the data.

Built on **Bun** end to end: Bun serves the API, bundles the React client, and
runs the SQLite database through `bun:sqlite`.

```
                        ┌──────────────────────────────────────────┐
  Browser               │  Bun.serve — API, SSE and client bundler │
  ┌───────────────┐     ├──────────────────────────────────────────┤
  │ React + TS    │◄───►│  routes/     HTTP surface                │
  │ Tailwind v4   │ SSE │  inspector/  snapshot · detect · preview │
  │               │     │  scraper/    engine · browser · robots   │
  │ ┌───────────┐ │     │              extract · debug             │
  │ │ snapshot  │ │     │  services/   scrapers · runs · export    │
  │ │ (iframe,  │◄┼─────┤  security/   SSRF guard                  │
  │ │  picker)  │ │     │  storage/    artifacts (swappable)       │
  │ └───────────┘ │     │  database/   Drizzle schema              │
  └───────────────┘     └───────┬──────────────────┬───────────────┘
                                │                  │
                         Playwright (Chromium)   SQLite (bun:sqlite)
```

The **inspector** renders a target page in Playwright, strips it of anything
executable, and serves the result from our own origin. That is what makes
click-to-pick possible: the dashboard can iframe it and talk to it, which no
cross-origin page would allow.

---

## Quick start

```bash
bun install
bun run dev          # http://localhost:3000, with hot reload
```

The database and its schema are created on first boot. Chromium is downloaded by
Playwright the first time you run a scrape — or set `CHROMIUM_EXECUTABLE_PATH` to
reuse a browser you already have:

```bash
bun run browsers:install          # download Chromium via Playwright
# ...or point at an existing one:
export CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium
```

### Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server on `:3000` with React fast refresh |
| `bun run start` | Production server (bundles the client once at boot) |
| `bun run build` | Static client bundle in `dist/`, for hosting the UI separately |
| `bun run demo` | Sample website to scrape, on `:3100` |
| `bun run demo:seed` | Create six ready-made scrapers for the demo site |
| `bun run test` | Tests (in-memory database, never touches your data) |
| `bun run typecheck` | `tsc --noEmit` across server, client and shared types |
| `bun run db:generate` | Regenerate SQL migrations after a schema change |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:studio` | Drizzle Studio, to browse the database |

### Environment

Copy `.env.example` to `.env`. Everything has a working default.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `./data/scraper.db` | SQLite file; `:memory:` for a throwaway database |
| `CHROMIUM_EXECUTABLE_PATH` | auto-detected | Use an existing Chromium instead of downloading one |
| `CHROMIUM_NO_SANDBOX` | off (auto when running as root) | Adds `--no-sandbox`, needed in most containers |
| `ARTIFACTS_PATH` | `./data/artifacts` | Where screenshots and snapshots are stored |
| `ALLOW_PRIVATE_NETWORK` | on in development, **off in production** | Lets the scraper reach loopback and private addresses. See [Security](#security) |
| `ALLOWED_PRIVATE_HOSTS` | — | Comma-separated hosts exempt from the SSRF guard, e.g. `localhost:3100` |

---

## Try it: the demo site

The repo ships with a sample website built to be scraped, so you can see every
feature working before pointing the scraper at anything real.

```bash
bun run demo        # sample site on http://localhost:3100
bun run dev         # the scraper app on http://localhost:3000  (second terminal)
bun run demo:seed   # create six ready-made scrapers            (third terminal)
```

Then open http://localhost:3000, pick a demo scraper and press **Start**.
Re-running `demo:seed` replaces the demo scrapers rather than duplicating them.

### What each page is for

| Page | Shape | What it demonstrates |
| --- | --- | --- |
| `/products?page=1` | 48 products, 8 pages | **Rendered by JavaScript** after a 250 ms delay — `curl` returns an empty grid. Numbered pager plus an `a.next` link, so it works with both URL-pattern and next-button pagination |
| `/catalog` | Same 48 products | **Infinite scroll** — no pager; more cards load as you reach the bottom |
| `/reviews?page=1` | 60 reviews, 5 pages | A different record shape: dates in a `datetime` attribute, a rating in `data-rating`, two links per record, and a **required** field |
| `/jobs` | 24 rows, one page | A plain static table — the page to try **XPath** selectors on |
| `/product/7` | One record | No item selector, so the **whole page is one record** |
| `/admin` | — | **Disallowed in robots.txt**; the run refuses it and fails with the reason |
| `/flaky` | — | Fails twice, then succeeds — watch the **retries** in the log |
| `/slow?ms=8000` | — | Slow response; set a 2000 ms **timeout** to see it time out |
| `/boom` | — | Always HTTP 500 |

### The main example, field by field

This is the `Demo · Products (URL pattern)` preset. To build it by hand:

**Target**

| Setting | Value |
| --- | --- |
| Target URL | `http://localhost:3100/products?page=1` |
| Item selector | `.product` |
| Wait for selector | `.product` — the cards appear after the page loads |

**Fields**

| Field name | Selector | Extract | Notes |
| --- | --- | --- | --- |
| `name` | `.product-name` | Text | |
| `brand` | `.product-brand` | Text | |
| `price` | `.product-price` | Text | |
| `old_price` | `.product-old-price` | Text | Only every third product is discounted, so this column is often empty |
| `rating` | `.product-rating` | Text | |
| `image` | `img` | Image | Resolved to an absolute URL; shows as a thumbnail in the results table |
| `url` | `a.product-link` | Link | Resolved to an absolute URL |
| `sku` | *(empty)* | Attribute → `data-sku` | An empty selector reads the attribute off the item element itself |
| `category` | *(empty)* | Attribute → `data-category` | |
| `tags` | `.tag` | Text, **collect all matches** | Comes back as an array |

**Pagination & pacing**

| Setting | Value |
| --- | --- |
| Pagination | URL pattern |
| URL pattern | `http://localhost:3100/products?page={page}` |
| Max pages | `8` |
| Request delay | `300` ms |

That yields **48 rows across 8 pages** in about six seconds.

### The other presets

| Preset | Pagination | Yields |
| --- | --- | --- |
| `Demo · Products (URL pattern)` | `url-pattern` on `?page={page}` | 48 rows / 8 pages |
| `Demo · Products (next button)` | `selector` on `a.next` | 48 rows / 8 pages |
| `Demo · Catalog (infinite scroll)` | `scroll`, 10 rounds | 48 rows, duplicates dropped |
| `Demo · Reviews` | `selector` on `a.next` | 60 rows / 5 pages |
| `Demo · Jobs (XPath)` | none | 24 rows |
| `Demo · Product detail` | none | 1 row |

The configurations live in `apps/demo/presets.ts` — a good place to copy from
when writing your own.

### Scraping it over the API instead

```bash
curl -X POST localhost:3000/api/scrape -H 'content-type: application/json' -d '{
  "name": "Demo products",
  "url": "http://localhost:3100/products?page=1",
  "itemSelector": ".product",
  "waitForSelector": ".product",
  "fields": [
    { "name": "name",  "selector": ".product-name",  "type": "text" },
    { "name": "price", "selector": ".product-price", "type": "text" },
    { "name": "image", "selector": "img",            "type": "image" },
    { "name": "url",   "selector": "a.product-link", "type": "link" },
    { "name": "sku",   "selector": "", "type": "attribute", "attribute": "data-sku" }
  ],
  "pagination": {
    "mode": "url-pattern",
    "urlPattern": "http://localhost:3100/products?page={page}"
  },
  "maxPages": 8,
  "requestDelayMs": 300
}'
```

---

## Building a scraper visually

Open **Visual builder**, paste a URL, and press *Open preview*. The page is
rendered server-side, sanitized, and shown in an iframe you can click.

```
URL  →  Open preview  →  click an element  →  Add as field  →  Save
                              │
                              └─ or press Auto detect and accept the schema
```

Clicking an element gives you:

- a selector matching **just that element**, and one matching **all similar**
  siblings, each with a live match count
- the **repeating ancestor** when the element sits in a list — one click turns
  it into the item selector, and field selectors then become relative to it
- a **suggested field type** (an `<img>` becomes `image`, an `<a>` becomes
  `link`) and a preview of the value that would be extracted
- a **highlight** button that outlines every match in the preview

Every selector stays editable by hand, in CSS or XPath, and the **live preview
table** under the builder re-resolves as you type — it runs against the page
you are looking at, so there is no round trip.

### Auto detect

*Auto detect* looks for the repeated structure on the page and guesses what its
parts mean: headings become `title`, currency-shaped text becomes `price`,
`<time datetime>` becomes a date read from the attribute, `data-*` attributes on
the record become fields of their own. It reports a confidence per field and a
sample value, lists other repeating structures it found as alternatives, and
never applies anything without **Accept / Edit / Reject**.

On the bundled demo site it finds `article.product` with 12 fields.

### Test run

**Test run** scrapes a handful of records — five by default — so a
configuration can be checked in a second rather than by starting a full crawl.
It stops on the exact record asked for, even mid-page, and always leaves a
**selector report** behind. Test runs are tagged in History and can be filtered
out with `?mode=normal`.

### Debugger

When a page fails, or an item selector matches nothing, the run captures what
it saw, so a failure can be understood without reproducing it:

| Captured | Why |
| --- | --- |
| **Screenshot** | What the browser actually rendered, which is often not what you expected |
| **HTML snapshot** | The DOM at the moment of failure |
| **Console log** | Page errors and warnings |
| **Network errors** | Failed requests and 4xx/5xx responses |
| **Selector report** | Per-field match counts — *expected 6, found 0* |

The selector report is the one that usually answers the question outright:

```
Item selector .product                           6 items found

Field    Selector            Found   Sample
name     .product-name       6 / 6   Basalt Webcam 1
price    .product-price      6 / 6   $56.99
stock    .in-stock           0 / 6   nothing matched
```

---

## Configuring a scraper

A scraper is a **target URL**, an **item selector** matching the element that
repeats once per record, and a list of **fields** — one per output column.

```
URL        https://example.com/products
Selector   .product

Fields
  name   → .product-name          (text)
  price  → .product-price         (text)
  image  → img                    (image → src, resolved absolute)
  url    → a                      (link  → href, resolved absolute)
```

Field selectors are evaluated **relative to the item element**, so `.product-name`
means "inside this product". Leave the item selector empty to treat the whole page
as a single record.

### Field types

| Type | Reads |
| --- | --- |
| `text` | Visible text (`innerText`, falling back to `textContent`) |
| `link` | `href`, resolved to an absolute URL |
| `image` | `src` → `data-src` → `srcset` → CSS background, resolved absolute |
| `title` | `title` attribute → `aria-label` → `alt` → text |
| `attribute` | Any attribute you name, e.g. `data-sku` |
| `html` | The element's `innerHTML` |

Each field can also **collect all matches** into an array, **trim** whitespace
(on by default), and be marked **required** — a record missing a required field is
dropped instead of saved half-empty.

Selectors can be written as **CSS or XPath**, per field. An absolute XPath used
inside an item (`//span[@class='price']`) is rewritten to stay relative, so it
does not escape the record it belongs to.

### Pagination

| Mode | How it works |
| --- | --- |
| `none` | One page |
| `url-pattern` | `https://site.com/p?page={page}` — `{page}` is substituted; supports a start page, a step, and parallel fetching |
| `selector` | Clicks a next-page element and waits for the content to change; handles both navigation and in-place updates |
| `scroll` | Scrolls to the bottom N times for infinite-scroll lists |

Every mode stops early when a page yields nothing new, and `maxPages` is a hard
ceiling so a run can never walk a site forever. Identical records are
de-duplicated across pages.

### Reliability

Per-page **retries** with exponential backoff, a navigation **timeout**, a
**request delay** between pages, and `waitUntil` / `waitForSelector` for content
that renders after load. A failure on the first page fails the run; later pages
are logged and skipped, and three consecutive failures end the run. HTTP 4xx/5xx
counts as a failure rather than being silently scraped as an error page. Runs
killed by a server restart are marked as interrupted on the next boot, with their
partial results intact.

---

## API

The UI is a client of this API; nothing is hidden from it.

### Scrapers

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/scrapers` | List saved scrapers |
| `POST` | `/api/scrapers` | Create one |
| `GET` | `/api/scrapers/:id` | Read one |
| `PUT` | `/api/scrapers/:id` | Update one |
| `DELETE` | `/api/scrapers/:id` | Delete one (history is kept) |
| `POST` | `/api/scrapers/:id/duplicate` | Fork a configuration |

### Running

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/scrapers/:id/start` | Start a run; body may carry one-off overrides |
| `POST` | `/api/scrapers/:id/stop` | Stop the scraper's active run |
| `GET` | `/api/scrapers/:id/status` | Status of its most recent run |
| `GET` | `/api/scrapers/:id/results` | Results of its most recent run |
| `POST` | `/api/scrape` | Run a configuration without saving it |
| `POST` | `/api/runs/:id/stop` | Stop a specific run |
| `GET` | `/api/runs/:id` · `/status` · `/results` · `/logs` | Run detail |

### History, export, settings

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/history` | Paginated run history (`page`, `pageSize`, `status`, `search`) |
| `DELETE` | `/api/runs/:id` | Delete a run and its results |
| `GET` | `/api/results/:id/export?format=csv\|json\|xlsx` | Download results |
| `GET` | `/api/settings` · `PUT` · `DELETE` | Read, update, reset settings |
| `GET` | `/api/stats` | Dashboard aggregates |
| `GET` | `/api/health` | Runtime and browser diagnostics |

### Visual inspector

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/inspector/snapshots` | Render a page and store an inert copy |
| `GET` | `/api/inspector/snapshots/:id/page` | The snapshot, served same-origin under a strict CSP |
| `POST` | `/api/inspector/test-selector` | Count and sample what a selector matches |
| `POST` | `/api/inspector/preview` | Run a field plan against the live page |
| `POST` | `/api/inspector/detect` | Guess the page's repeated structure |

### Test runs and debugging

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/scrapers/:id/test` | Capped run of a saved scraper (`maxItems`, default 5) |
| `POST` | `/api/scrape/test` | Capped run of an unsaved configuration |
| `GET` | `/api/runs/:id/artifacts` | Debug artifacts captured for a run |
| `GET` | `/api/runs/:id/artifacts/:artifactId` | One artifact's content |
| `GET` | `/api/history?mode=normal\|test\|all` | Filter test runs in or out |

### Realtime (SSE)

```js
const events = new EventSource(`/api/runs/${runId}/events`);
events.addEventListener("log",      (e) => console.log(JSON.parse(e.data)));
events.addEventListener("progress", (e) => console.log(JSON.parse(e.data)));
events.addEventListener("status",   (e) => console.log(JSON.parse(e.data)));
events.addEventListener("items",    (e) => console.log(JSON.parse(e.data)));
```

`GET /api/events` streams every run; `?runId=` filters to one. Log lines are also
persisted, so reloading mid-run replays the history and then continues live.

### Example

```bash
curl -X POST localhost:3000/api/scrape -H 'content-type: application/json' -d '{
  "name": "Products",
  "url": "https://example.com/products",
  "itemSelector": ".product",
  "fields": [
    { "name": "name",  "selector": ".product-name",  "type": "text" },
    { "name": "price", "selector": ".product-price", "type": "text" },
    { "name": "image", "selector": "img",            "type": "image" },
    { "name": "url",   "selector": "a",              "type": "link" }
  ],
  "pagination": {
    "mode": "url-pattern",
    "urlPattern": "https://example.com/products?page={page}"
  },
  "maxPages": 5,
  "requestDelayMs": 1000
}'
```

---

## Project structure

```
apps/
  demo/                   Sample site to scrape, plus ready-made presets
  web/                    React client
    components/
      inspector/          PickPanel, DetectModal
      ui/                 Buttons, cards, modals, toasts, states
      ...                 DataTable, LogConsole, ScraperForm, FieldEditor, DebugPanel
    pages/                Dashboard, Scrapers, Editor, VisualBuilder, Results, History, Settings
    hooks/                usePicker, useRunStream (SSE), useTheme, useRouter, useAsync, useToast
    services/             API client
  server/
    routes/               HTTP surface, SSE, inspector endpoints
    inspector/            serialize, picker-script, detect, service
    scraper/              browser, engine, extract, robots, manager, debug
    security/             SSRF guard
    storage/              Artifact store behind an interface (local disk today)
    database/             Drizzle schema, client, migrations runner
    services/             scrapers, runs, results, export, settings
    utils/                http, errors, async, validation, event bus
packages/shared/          Types and defaults shared by client and server
drizzle/                  Generated SQL migrations
tests/                    Unit and integration tests
```

The **shared types** package is what keeps the two halves honest: the form, the
API and the engine all read one `ScraperConfig` definition, so a field the UI can
produce is a field the engine can run.

### Extending it

- **A new field type** — add it to `FieldType` in `packages/shared/types.ts`, read
  it in `readValue` in `apps/server/scraper/extract.ts`, and list it in
  `FieldEditor.tsx`. The form, validation and exporters pick it up from there.
- **A new pagination mode** — add it to `PaginationMode`, write a `#runYourMode`
  method in `apps/server/scraper/engine.ts`, and branch to it in `run()`.
- **A new export format** — add a case in `apps/server/services/export-service.ts`.
- **Scaling out** — `ScrapeRunner` has no global state and `RunSink` is a plain
  interface, so moving runs onto a queue or separate workers means implementing
  that interface against your transport rather than rewriting the engine.
- **Another storage backend** — implement `ArtifactStore`
  (`apps/server/storage/types.ts`) and return it from `storage/index.ts`.
  Nothing that writes screenshots or snapshots needs to change.

---

## Security

### SSRF protection

The scraper and the inspector both fetch URLs chosen by whoever is using the
app, from inside the server's network. Every target passes through a guard
(`apps/server/security/ssrf.ts`) that blocks:

- loopback (`127.0.0.0/8`, `::1`, `localhost`)
- private ranges (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`)
- link-local, including the **cloud metadata endpoint** `169.254.169.254`
- carrier-grade NAT, multicast and reserved ranges
- internal hostnames such as `metadata.google.internal` and any `.internal` name
- IPv4-mapped IPv6 (`::ffff:127.0.0.1`) and non-http(s) schemes

A hostname is resolved first, and **every** address it maps to must be public —
a name resolving to both a public and a private address is treated as a DNS
rebinding attempt. Navigation requests are re-checked inside the browser
context, so a redirect cannot land somewhere the pre-flight check never saw.

`ALLOW_PRIVATE_NETWORK` defaults to **on in development** (so the bundled demo
site on `localhost:3100` works) and **off in production**. The startup banner
always states which policy is active. To scrape an internal host from a
deployed instance, exempt it explicitly rather than disabling the guard:

```bash
ALLOWED_PRIVATE_HOSTS=intranet.example.com:8080
```

### The snapshot is served from our origin

Click-to-pick needs the preview to be same-origin, which means third-party HTML
is served from our domain. Two independent layers keep that safe:

1. **Sanitization** — `<script>`, `<iframe>`, `<object>`, every `on*` handler
   and every `javascript:` URL are removed when the snapshot is serialized.
2. **Content-Security-Policy** — `default-src 'none'` with a per-response nonce,
   so only the picker script can execute even if sanitization missed something.
   `base-uri` is pinned to the target's origin, `form-action` is `'none'`.

Snapshots are scratch data: they expire after an hour and are capped in number.

### Other measures

- Every numeric setting is clamped server-side, so a crafted payload cannot
  turn into a request flood against a target site.
- Field names are restricted to characters that survive a CSV header.
- Artifact keys are sanitized and confined to the store root, so a key can
  never escape it.
- The browser runs headless with no debugging port exposed.

Not yet implemented, and on the roadmap: authentication, authorization, rate
limiting and secret encryption. **Do not expose this on a public network as it
stands.**

## Responsible use

This tool is for **publicly accessible data only**.

- **robots.txt is respected by default.** Disallowed URLs are refused and the run
  fails with the reason. `Crawl-delay` overrides your configured delay when the
  site asks for a slower crawl. The toggle that disables this exists for sites you
  own or have written permission to crawl — not as a way around a refusal.
- **Rate limits.** The default delay is 1 second per page and parallelism is
  capped globally in Settings. Keep requests slow enough that you never degrade
  the service for anyone else.
- **Terms of use.** A site's terms apply whether or not its robots.txt mentions
  you. Check them before you scrape.
- **Personal data.** Do not collect it without a lawful basis.
- Images, fonts and media are blocked by default — faster for you, and far less
  work for the target server.

You are responsible for how you use this.

---

## Roadmap

Phase 1 (visual building and debugging) is done. The rest is planned in order,
each phase leaving the app runnable:

| Phase | Scope | Status |
| --- | --- | --- |
| **1 — Core UX** | Visual builder, selector inspector, auto detect, test run, debugger | ✅ done |
| **2 — Workflow** | Action workflow (click, type, scroll before extraction), data transformation pipeline, incremental scraping, dataset management | planned |
| **3 — Automation** | Scheduler, change monitoring, keyword monitoring, webhooks, notifications | planned |
| **4 — Intelligence** | AI-assisted schema generation behind a provider abstraction | planned |
| **5 — Scale** | Queue and workers, resource monitoring, PostgreSQL and object-storage abstractions | planned |

The architecture already anticipates the later phases: `RunSink` decouples the
engine from persistence (phase 5), `ArtifactStore` is an interface (phase 5),
and every scrape is a `Run` with a frozen config snapshot (phases 2–3).

## License

MIT

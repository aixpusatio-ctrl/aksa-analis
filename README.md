# Web Scraper

A working web scraper with a modern dashboard — not a mockup. Configure a target
through a form, run it against JavaScript-heavy pages with Playwright, watch the
log stream in realtime, then browse and export the data.

Built on **Bun** end to end: Bun serves the API, bundles the React client, and
runs the SQLite database through `bun:sqlite`.

```
React + TypeScript + Tailwind v4   →   Bun.serve (API + SSE + bundler)
                                        ├── Playwright (Chromium)
                                        └── Drizzle ORM → SQLite (bun:sqlite)
```

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
| `bun run test` | Unit tests (in-memory database, never touches your data) |
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
  web/                    React client
    components/           UI kit, DataTable, LogConsole, ScraperForm, FieldEditor
    pages/                Dashboard, Scrapers, Editor, Results, History, Settings
    hooks/                useRunStream (SSE), useTheme, useRouter, useAsync, useToast
    services/             API client
  server/
    routes/               HTTP routes and the SSE endpoint
    scraper/              browser, engine, extract, pagination, robots, manager
    database/             Drizzle schema, client, migrations runner
    services/             scrapers, runs, results, export, settings
    utils/                http, errors, async, validation, event bus
packages/shared/          Types and defaults shared by client and server
drizzle/                  Generated SQL migrations
tests/                    Unit tests
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

---

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

## License

MIT

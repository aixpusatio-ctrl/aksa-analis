import {
  JOBS,
  PAGE_SIZE,
  PRODUCTS,
  REVIEWS,
  TOTAL_PAGES,
  formatIdr,
  formatUsd,
  productsForPage,
  type Job,
  type Product,
  type Review,
} from "./data.ts";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Shared chrome so every demo page looks like one site. */
function layout(title: string, body: string, options: { script?: string } = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Demo Shop</title>
<style>
  :root { color-scheme: light; --line:#e2e8f0; --muted:#64748b; --ink:#0f172a; --brand:#4f46e5; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:var(--ink); background:#f8fafc; }
  header.site { background:#fff; border-bottom:1px solid var(--line); padding:14px 24px; display:flex; gap:20px; align-items:center; flex-wrap:wrap; position:sticky; top:0; z-index:5; }
  header.site strong { font-size:15px; }
  header.site nav a { color:var(--muted); text-decoration:none; margin-right:16px; font-size:14px; }
  header.site nav a:hover, header.site nav a.active { color:var(--brand); }
  main { max-width:1100px; margin:0 auto; padding:28px 24px 64px; }
  h1 { font-size:24px; margin:0 0 6px; }
  .lede { color:var(--muted); margin:0 0 24px; }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
  .product { background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:8px; }
  .product img { width:100%; height:120px; object-fit:cover; border-radius:8px; background:#f1f5f9; }
  .product-name { font-weight:600; font-size:15px; }
  .product-brand { color:var(--muted); font-size:13px; }
  .price-row { display:flex; align-items:baseline; gap:8px; }
  .product-price { font-weight:700; color:#0f766e; }
  .product-old-price { color:#94a3b8; text-decoration:line-through; font-size:13px; }
  .product-rating { font-size:13px; color:#b45309; }
  .badges { display:flex; gap:6px; flex-wrap:wrap; }
  .tag { font-size:11px; background:#eef2ff; color:#4338ca; border-radius:999px; padding:2px 8px; }
  .out-of-stock { font-size:12px; color:#be123c; font-weight:600; }
  .pagination { margin-top:28px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .pagination a, .pagination span { padding:6px 12px; border:1px solid var(--line); border-radius:8px; background:#fff; text-decoration:none; color:var(--ink); font-size:14px; }
  .pagination .current { background:var(--brand); color:#fff; border-color:var(--brand); }
  .pagination .disabled { color:#cbd5e1; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  th,td { text-align:left; padding:10px 14px; border-bottom:1px solid var(--line); font-size:14px; vertical-align:top; }
  th { background:#f1f5f9; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  .review { background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:12px; }
  .review-head { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:baseline; }
  .review-title { font-weight:600; }
  .review-author { color:var(--brand); text-decoration:none; font-size:13px; }
  .review-meta { color:var(--muted); font-size:13px; }
  .verified { font-size:11px; background:#dcfce7; color:#15803d; border-radius:999px; padding:2px 8px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px; }
  .card h2 { margin:0 0 4px; font-size:16px; }
  .card p { margin:0 0 10px; color:var(--muted); font-size:14px; }
  code { background:#f1f5f9; padding:1px 6px; border-radius:5px; font:13px ui-monospace,Menlo,Consolas,monospace; }
  pre { background:#0f172a; color:#e2e8f0; padding:14px; border-radius:10px; overflow-x:auto; font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace; }
  .note { background:#fffbeb; border:1px solid #fde68a; color:#92400e; border-radius:10px; padding:12px 14px; font-size:14px; }
  .sentinel { padding:22px; text-align:center; color:var(--muted); font-size:14px; }
</style>
</head>
<body>
<header class="site">
  <strong>Demo Shop</strong>
  <nav>
    <a href="/">Overview</a>
    <a href="/products">Products</a>
    <a href="/catalog">Infinite scroll</a>
    <a href="/reviews">Reviews</a>
    <a href="/jobs">Jobs</a>
    <a href="/robots.txt">robots.txt</a>
  </nav>
</header>
<main>${body}</main>
${options.script ? `<script>${options.script}</script>` : ""}
</body>
</html>`;
}

/** Inline SVG thumbnails, so the results table shows real images. */
export function productImage(id: number): string {
  const hue = (id * 47) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="hsl(${hue} 70% 92%)"/>
  <circle cx="160" cy="92" r="46" fill="hsl(${hue} 65% 72%)"/>
  <rect x="60" y="150" width="200" height="14" rx="7" fill="hsl(${hue} 50% 80%)"/>
  <text x="160" y="100" font-family="sans-serif" font-size="26" font-weight="700"
        fill="hsl(${hue} 70% 28%)" text-anchor="middle">#${id}</text>
</svg>`;
}

const productCard = (p: Product): string => `
    <article class="product" data-sku="${p.sku}" data-product-id="${p.id}" data-category="${escapeHtml(p.category)}" data-stock="${p.stock}">
      <a href="/product/${p.id}"><img src="/img/${p.id}.svg" alt="${escapeHtml(p.name)}" title="Photo of ${escapeHtml(p.name)}"></a>
      <span class="product-name">${escapeHtml(p.name)}</span>
      <span class="product-brand">${escapeHtml(p.brand)}</span>
      <div class="price-row">
        <span class="product-price">${formatUsd(p.price)}</span>
        ${p.oldPrice ? `<span class="product-old-price">${formatUsd(p.oldPrice)}</span>` : ""}
      </div>
      <span class="product-rating">★ ${p.rating} (${p.reviews} reviews)</span>
      <div class="badges">${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
      ${p.stock === 0 ? `<span class="out-of-stock">Out of stock</span>` : ""}
      <a class="product-link" href="/product/${p.id}">View details</a>
    </article>`;

/* ------------------------------------------------------------------ */
/* /products — JS-rendered, numbered pagination + a next link         */
/* ------------------------------------------------------------------ */

export function productsPage(page: number): string {
  const items = productsForPage(page);
  const prev = page > 1 ? `<a class="prev" href="/products?page=${page - 1}">← Previous</a>` : `<span class="disabled">← Previous</span>`;
  const next = page < TOTAL_PAGES ? `<a class="next" href="/products?page=${page + 1}">Next →</a>` : `<span class="disabled next-disabled">Next →</span>`;
  const numbers = Array.from({ length: TOTAL_PAGES }, (_, i) =>
    i + 1 === page ? `<span class="current">${i + 1}</span>` : `<a href="/products?page=${i + 1}">${i + 1}</a>`,
  ).join("");

  // The cards are injected by script on purpose: fetching this URL with curl
  // returns an empty list, so the page only yields data through a real browser.
  const script = `
    const items = ${JSON.stringify(items)};
    const render = (p) => \`
    <article class="product" data-sku="\${p.sku}" data-product-id="\${p.id}" data-category="\${p.category}" data-stock="\${p.stock}">
      <a href="/product/\${p.id}"><img src="/img/\${p.id}.svg" alt="\${p.name}" title="Photo of \${p.name}"></a>
      <span class="product-name">\${p.name}</span>
      <span class="product-brand">\${p.brand}</span>
      <div class="price-row">
        <span class="product-price">$\${p.price.toFixed(2)}</span>
        \${p.oldPrice ? '<span class="product-old-price">$' + p.oldPrice.toFixed(2) + '</span>' : ''}
      </div>
      <span class="product-rating">★ \${p.rating} (\${p.reviews} reviews)</span>
      <div class="badges">\${p.tags.map(t => '<span class="tag">' + t + '</span>').join('')}</div>
      \${p.stock === 0 ? '<span class="out-of-stock">Out of stock</span>' : ''}
      <a class="product-link" href="/product/\${p.id}">View details</a>
    </article>\`;
    // A short delay mimics a real client-side render, so "wait for selector" matters.
    setTimeout(() => {
      document.getElementById('product-grid').innerHTML = items.map(render).join('');
      document.getElementById('render-state').textContent = 'rendered by JavaScript';
    }, 250);`;

  return layout(
    `Products — page ${page}`,
    `<h1>Products</h1>
     <p class="lede">Page ${page} of ${TOTAL_PAGES} · ${PRODUCTS.length} products total ·
       <span id="render-state">rendering…</span></p>
     <div class="note">These cards are inserted by JavaScript after a 250&nbsp;ms delay.
       A plain HTTP fetch sees an empty grid — this is the page that proves the Playwright engine is doing its job.</div>
     <div class="grid" id="product-grid"></div>
     <div class="pagination">${prev}${numbers}${next}</div>`,
    { script },
  );
}

/* ------------------------------------------------------------------ */
/* /catalog — infinite scroll                                          */
/* ------------------------------------------------------------------ */

export function catalogPage(): string {
  const script = `
    const all = ${JSON.stringify(PRODUCTS)};
    const BATCH = ${PAGE_SIZE};
    let shown = 0;
    const grid = document.getElementById('product-grid');
    const status = document.getElementById('scroll-status');

    function renderBatch() {
      const batch = all.slice(shown, shown + BATCH);
      if (batch.length === 0) { status.textContent = 'All ' + all.length + ' products loaded.'; return; }
      shown += batch.length;
      grid.insertAdjacentHTML('beforeend', batch.map(p => \`
        <article class="product" data-sku="\${p.sku}" data-product-id="\${p.id}">
          <a href="/product/\${p.id}"><img src="/img/\${p.id}.svg" alt="\${p.name}" title="Photo of \${p.name}"></a>
          <span class="product-name">\${p.name}</span>
          <span class="product-brand">\${p.brand}</span>
          <div class="price-row"><span class="product-price">$\${p.price.toFixed(2)}</span></div>
          <span class="product-rating">★ \${p.rating} (\${p.reviews} reviews)</span>
          <a class="product-link" href="/product/\${p.id}">View details</a>
        </article>\`).join(''));
      status.textContent = 'Showing ' + shown + ' of ' + all.length + ' — scroll for more';
    }

    renderBatch();
    // Load the next batch when the sentinel scrolls into view.
    new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) setTimeout(renderBatch, 150);
    }, { rootMargin: '120px' }).observe(document.getElementById('sentinel'));`;

  return layout(
    "Catalog — infinite scroll",
    `<h1>Catalog</h1>
     <p class="lede">No pager: more products load as you reach the bottom. <span id="scroll-status"></span></p>
     <div class="note">Use pagination mode <code>scroll</code>. Each scroll round re-extracts the whole list,
       and the engine de-duplicates, so only genuinely new rows are kept.</div>
     <div class="grid" id="product-grid"></div>
     <div class="sentinel" id="sentinel">Loading more…</div>`,
    { script },
  );
}

/* ------------------------------------------------------------------ */
/* /reviews — table rows, dates, nested links, attributes              */
/* ------------------------------------------------------------------ */

export function reviewsPage(page: number): string {
  const perPage = 12;
  const totalPages = Math.ceil(REVIEWS.length / perPage);
  const rows = REVIEWS.slice((page - 1) * perPage, page * perPage);
  const product = (r: Review) => PRODUCTS.find((p) => p.id === r.productId);

  const body = rows
    .map(
      (r: Review) => `
    <article class="review" data-review-id="${r.id}" data-rating="${r.rating}" data-product-id="${r.productId}">
      <div class="review-head">
        <span class="review-title">${escapeHtml(r.title)}</span>
        <span class="review-meta"><time class="review-date" datetime="${r.date}">${r.date}</time></span>
      </div>
      <div class="review-meta">
        <a class="review-author" href="/user/${r.authorHandle}">${escapeHtml(r.author)}</a>
        · <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        · reviewing <a class="review-product" href="/product/${r.productId}">${escapeHtml(product(r)?.name ?? "")}</a>
        ${r.verified ? `<span class="verified">verified purchase</span>` : ""}
      </div>
      <p class="review-body">${escapeHtml(r.body)}</p>
      <span class="review-helpful">${r.helpful} people found this helpful</span>
    </article>`,
    )
    .join("");

  const pager = `<div class="pagination">
      ${page > 1 ? `<a class="prev" href="/reviews?page=${page - 1}">← Previous</a>` : `<span class="disabled">← Previous</span>`}
      <span class="current">${page}</span>
      ${page < totalPages ? `<a class="next" href="/reviews?page=${page + 1}">Next →</a>` : `<span class="disabled">Next →</span>`}
    </div>`;

  return layout(
    `Reviews — page ${page}`,
    `<h1>Customer reviews</h1>
     <p class="lede">Page ${page} of ${totalPages} · ${REVIEWS.length} reviews. Server-rendered HTML.</p>
     <div class="note">A different record shape: dates in a <code>datetime</code> attribute, two links per record,
       and a star rating that is easier to read from <code>data-rating</code> than from the text.</div>
     ${body}
     ${pager}`,
  );
}

/* ------------------------------------------------------------------ */
/* /jobs — static table, good for XPath                                */
/* ------------------------------------------------------------------ */

export function jobsPage(): string {
  const rows = JOBS.map(
    (j: Job) => `
      <tr class="job" data-job-id="${j.id}" data-remote="${j.remote}">
        <td class="job-title"><a href="/job/${j.id}">${escapeHtml(j.title)}</a></td>
        <td class="job-company">${escapeHtml(j.company)}</td>
        <td class="job-location">${escapeHtml(j.location)}</td>
        <td class="job-type">${escapeHtml(j.type)}</td>
        <td class="job-salary">${formatIdr(j.salaryMin)} – ${formatIdr(j.salaryMax)}</td>
        <td class="job-skills">${j.skills.map((s) => `<span class="skill">${escapeHtml(s)}</span>`).join(" ")}</td>
        <td class="job-posted">${j.posted}</td>
      </tr>`,
  ).join("");

  return layout(
    "Jobs",
    `<h1>Open roles</h1>
     <p class="lede">${JOBS.length} roles, all on one page. Plain server-rendered HTML — no JavaScript needed.</p>
     <div class="note">A table rather than cards. Good for trying <strong>XPath</strong> selectors such as
       <code>//tr[@class='job']</code> with <code>.//td[@class='job-title']</code>.</div>
     <table>
       <thead><tr><th>Title</th><th>Company</th><th>Location</th><th>Type</th><th>Salary</th><th>Skills</th><th>Posted</th></tr></thead>
       <tbody>${rows}</tbody>
     </table>`,
  );
}

/* ------------------------------------------------------------------ */
/* Detail, admin, error pages                                          */
/* ------------------------------------------------------------------ */

export function productDetailPage(id: number): string {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return layout("Not found", `<h1>Product not found</h1>`);

  return layout(
    p.name,
    `<article class="card" itemscope>
       <h1 class="detail-name">${escapeHtml(p.name)}</h1>
       <p class="lede"><span class="detail-brand">${escapeHtml(p.brand)}</span> · <span class="detail-category">${escapeHtml(p.category)}</span></p>
       <img src="/img/${p.id}.svg" alt="${escapeHtml(p.name)}" style="max-width:320px;border-radius:10px">
       <p><span class="detail-price">${formatUsd(p.price)}</span>
          ${p.oldPrice ? `<span class="product-old-price">${formatUsd(p.oldPrice)}</span>` : ""}</p>
       <p class="detail-stock">${p.stock === 0 ? "Out of stock" : `${p.stock} in stock`}</p>
       <p class="detail-sku">SKU: <code>${p.sku}</code></p>
       <div class="badges">${p.colors.map((c) => `<span class="tag detail-color">${escapeHtml(c)}</span>`).join("")}</div>
     </article>`,
  );
}

export function adminPage(): string {
  return layout(
    "Admin",
    `<h1>Admin area</h1>
     <div class="note">This path is <strong>disallowed in robots.txt</strong>. With "Respect robots.txt" on,
       the scraper refuses it and the run fails with the reason — which is the behaviour you want to see.</div>
     <p class="secret-data">internal-only-value-42</p>`,
  );
}

export function overviewPage(presets: { id: string; title: string; summary: string; path: string }[]): string {
  const cards = presets
    .map(
      (preset) => `
      <div class="card">
        <h2>${escapeHtml(preset.title)}</h2>
        <p>${preset.summary}</p>
        <p><a href="${preset.path}">${escapeHtml(preset.path)}</a> · preset id <code>${escapeHtml(preset.id)}</code></p>
      </div>`,
    )
    .join("");

  return layout(
    "Overview",
    `<h1>Demo Shop</h1>
     <p class="lede">A sample site built to be scraped. Each page exercises a different part of the engine.</p>
     <div class="note">Load the matching scraper configurations with <code>bun run demo:seed</code>,
       then open the dashboard and press Start.</div>
     ${cards}
     <div class="card">
       <h2>Pages that misbehave on purpose</h2>
       <p>For trying out error handling:</p>
       <ul>
         <li><code>/admin</code> — blocked by robots.txt</li>
         <li><code>/flaky</code> — fails the first two requests, then succeeds (watch the retries)</li>
         <li><code>/slow?ms=5000</code> — responds slowly (try a 2000&nbsp;ms timeout)</li>
         <li><code>/boom</code> — always returns HTTP 500</li>
       </ul>
     </div>`,
  );
}

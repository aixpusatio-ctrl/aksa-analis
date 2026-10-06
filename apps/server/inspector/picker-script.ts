/**
 * The element picker, injected into the snapshot frame.
 *
 * It is shipped as a string because it runs inside the sanitized snapshot
 * document, not in the dashboard bundle. It talks to the parent window over
 * `postMessage` and never touches the network.
 */
export const PICKER_SCRIPT = String.raw`
(() => {
  "use strict";

  var HIGHLIGHT_ID = "__aksa_highlight__";
  var MATCH_CLASS = "__aksa_match__";
  var hoverEnabled = true;
  var selected = null;

  /* ---------------------------------------------------------------- */
  /* Overlay styling                                                  */
  /* ---------------------------------------------------------------- */

  var style = document.createElement("style");
  style.textContent =
    "." + MATCH_CLASS + "{outline:2px solid rgba(16,185,129,.9)!important;outline-offset:1px!important;background:rgba(16,185,129,.10)!important}" +
    "#" + HIGHLIGHT_ID + "{position:absolute;pointer-events:none;z-index:2147483647;border:2px solid #4f46e5;background:rgba(79,70,229,.12);border-radius:3px;transition:all .04s linear}" +
    "#" + HIGHLIGHT_ID + " span{position:absolute;top:-21px;left:-2px;background:#4f46e5;color:#fff;font:11px/1.6 ui-monospace,Menlo,monospace;padding:0 6px;border-radius:4px;white-space:nowrap}" +
    ".__aksa_picked__{outline:2px solid #4f46e5!important;outline-offset:1px!important}" +
    "html{cursor:crosshair}";
  document.documentElement.appendChild(style);

  var box = document.createElement("div");
  box.id = HIGHLIGHT_ID;
  box.style.display = "none";
  box.appendChild(document.createElement("span"));
  document.documentElement.appendChild(box);

  function place(el, label) {
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) { box.style.display = "none"; return; }
    box.style.display = "block";
    box.style.top = (r.top + window.scrollY) + "px";
    box.style.left = (r.left + window.scrollX) + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
    box.firstChild.textContent = label;
  }

  /* ---------------------------------------------------------------- */
  /* Selector generation                                              */
  /* ---------------------------------------------------------------- */

  // Classes that look generated (hashes, utility noise, transient state) make
  // brittle selectors, so they are never used to identify an element.
  function isStableClass(name) {
    if (!name || name.length > 40) return false;
    if (name.indexOf("__aksa") === 0) return false;
    if (/^(is-|has-|js-)/.test(name)) return false;
    if (/(active|open|selected|hover|focus|hidden|visible|current|disabled)$/i.test(name)) return false;
    if (/[0-9a-f]{6,}/i.test(name)) return false;       // css-modules / emotion hashes
    if (/^[a-z]{1,2}[0-9]+$/i.test(name)) return false; // minified single letters
    if (/^\d/.test(name)) return false;
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);
  }

  function stableClasses(el) {
    var out = [];
    var list = el.classList;
    for (var i = 0; i < list.length; i++) if (isStableClass(list[i])) out.push(list[i]);
    return out;
  }

  function isStableId(id) {
    if (!id) return false;
    if (id.length > 40) return false;
    if (/[0-9a-f]{8,}/i.test(id)) return false;
    if (/^(ember|react|vue|radix|mui|headlessui)[-:]?/i.test(id)) return false;
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(id);
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/([^\w-])/g, "\\$1");
  }

  function countFor(selector) {
    try { return document.querySelectorAll(selector).length; } catch (e) { return -1; }
  }

  /**
   * Build a CSS selector for one element.
   * 'generalize' drops the positional parts, so the result matches every
   * sibling that looks the same — which is what you want for a list item.
   */
  function cssSelector(el, generalize) {
    if (!generalize && isStableId(el.id)) {
      var byId = "#" + cssEscape(el.id);
      if (countFor(byId) === 1) return byId;
    }

    // A distinctive class on its own is the most readable selector there is.
    var own = stableClasses(el);
    for (var c = 0; c < own.length; c++) {
      var candidate = el.tagName.toLowerCase() + "." + cssEscape(own[c]);
      var n = countFor(candidate);
      if (n === 1 || (generalize && n > 1)) return candidate;
    }
    if (own.length > 1) {
      var combo = el.tagName.toLowerCase() + "." + own.map(cssEscape).join(".");
      var comboCount = countFor(combo);
      if (comboCount === 1 || (generalize && comboCount > 1)) return combo;
    }

    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var part = node.tagName.toLowerCase();
      var classes = stableClasses(node);
      if (classes.length) part += "." + classes.slice(0, 2).map(cssEscape).join(".");

      if (!generalize) {
        var parent = node.parentElement;
        if (parent) {
          var sameTag = [];
          for (var k = 0; k < parent.children.length; k++) {
            if (parent.children[k].tagName === node.tagName) sameTag.push(parent.children[k]);
          }
          if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
        }
      }

      parts.unshift(part);
      var selector = parts.join(" > ");
      var matches = countFor(selector);
      if (matches === 1 || (generalize && matches > 0 && parts.length >= 2)) return selector;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function xpathSelector(el, generalize) {
    if (!generalize && isStableId(el.id)) return '//*[@id="' + el.id + '"]';

    var own = stableClasses(el);
    if (own.length) {
      var byClass = "//" + el.tagName.toLowerCase() + '[contains(concat(" ", normalize-space(@class), " "), " ' + own[0] + ' ")]';
      try {
        var r = document.evaluate(byClass, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        if (r.snapshotLength === 1 || (generalize && r.snapshotLength > 1)) return byClass;
      } catch (e) {}
    }

    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      var step = tag;
      if (parent && !generalize) {
        var same = [];
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === node.tagName) same.push(parent.children[i]);
        }
        if (same.length > 1) step += "[" + (same.indexOf(node) + 1) + "]";
      }
      parts.unshift(step);
      node = parent;
    }
    return "//" + parts.join("/");
  }

  /** A selector for this element relative to an ancestor item element. */
  function relativeSelector(el, item) {
    if (el === item) return "";
    var classes = stableClasses(el);
    for (var i = 0; i < classes.length; i++) {
      var candidate = "." + cssEscape(classes[i]);
      try { if (item.querySelectorAll(candidate).length >= 1) return candidate; } catch (e) {}
    }
    var parts = [];
    var node = el;
    while (node && node !== item) {
      var part = node.tagName.toLowerCase();
      var own = stableClasses(node);
      if (own.length) part += "." + own.slice(0, 2).map(cssEscape).join(".");
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  /* ---------------------------------------------------------------- */
  /* Value reading — mirrors the server-side extractor                */
  /* ---------------------------------------------------------------- */

  function textOf(el) {
    var t = el.innerText || el.textContent || "";
    return t.replace(/\s+/g, " ").trim();
  }

  function suggestType(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === "img" || tag === "picture") return "image";
    if (tag === "a") return "link";
    if (tag === "time") return "text";
    if (el.querySelector && el.querySelector("img") && !textOf(el)) return "image";
    return "text";
  }

  function previewValue(el, type) {
    try {
      if (type === "link") {
        var a = el.matches("a[href]") ? el : el.querySelector("a[href]") || el.closest("a[href]");
        return a ? new URL(a.getAttribute("href"), document.baseURI).href : null;
      }
      if (type === "image") {
        var img = el.tagName.toLowerCase() === "img" ? el : el.querySelector("img");
        var src = img && (img.getAttribute("src") || img.getAttribute("data-src"));
        return src ? new URL(src, document.baseURI).href : null;
      }
      return textOf(el);
    } catch (e) {
      return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Describing a pick                                                */
  /* ---------------------------------------------------------------- */

  function describe(el) {
    var css = cssSelector(el, false);
    var cssAll = cssSelector(el, true);
    var type = suggestType(el);
    return {
      ref: el.getAttribute("data-aksa-ref"),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList).filter(function (c) { return c.indexOf("__aksa") !== 0; }),
      css: css,
      cssAll: cssAll,
      xpath: xpathSelector(el, false),
      xpathAll: xpathSelector(el, true),
      suggestedType: type,
      text: textOf(el).slice(0, 200),
      preview: previewValue(el, type),
      countExact: countFor(css),
      countAll: countFor(cssAll),
      // The nearest ancestor that repeats — the natural "item" for a list.
      itemCandidate: itemCandidateFor(el),
    };
  }

  /** Walk up until an ancestor has siblings that look the same. */
  function itemCandidateFor(el) {
    var node = el;
    var depth = 0;
    while (node && node.parentElement && depth < 12) {
      var parent = node.parentElement;
      var signature = node.tagName + "|" + stableClasses(node).sort().join(".");
      var alike = 0;
      for (var i = 0; i < parent.children.length; i++) {
        var sibling = parent.children[i];
        if (sibling.tagName + "|" + stableClasses(sibling).sort().join(".") === signature) alike++;
      }
      if (alike >= 3) {
        var sel = cssSelector(node, true);
        return { selector: sel, count: countFor(sel), relative: relativeSelector(el, node) };
      }
      node = parent;
      depth++;
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* Messaging                                                        */
  /* ---------------------------------------------------------------- */

  function post(message) {
    parent.postMessage(Object.assign({ source: "aksa-picker" }, message), "*");
  }

  function clearMatches() {
    var marked = document.querySelectorAll("." + MATCH_CLASS);
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove(MATCH_CLASS);
  }

  function highlightAll(selector, kind) {
    clearMatches();
    if (!selector) return { count: 0, error: null };
    var nodes = [];
    try {
      if (kind === "xpath") {
        var r = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (var i = 0; i < r.snapshotLength; i++) {
          var n = r.snapshotItem(i);
          if (n && n.nodeType === 1) nodes.push(n);
        }
      } else {
        nodes = Array.prototype.slice.call(document.querySelectorAll(selector));
      }
    } catch (e) {
      return { count: -1, error: e.message };
    }
    for (var k = 0; k < nodes.length; k++) nodes[k].classList.add(MATCH_CLASS);
    if (nodes.length) nodes[0].scrollIntoView({ block: "center", behavior: "smooth" });
    return { count: nodes.length, error: null };
  }

  document.addEventListener(
    "mousemove",
    function (event) {
      if (!hoverEnabled) return;
      var el = event.target;
      if (!el || el.nodeType !== 1 || el.id === HIGHLIGHT_ID) return;
      place(el, el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).filter(function (c) { return c.indexOf("__aksa") !== 0; }).slice(0, 2).join(".") : ""));
    },
    true,
  );

  document.addEventListener("mouseleave", function () { box.style.display = "none"; }, true);

  document.addEventListener(
    "click",
    function (event) {
      if (!hoverEnabled) return;
      event.preventDefault();
      event.stopPropagation();
      var el = event.target;
      if (!el || el.nodeType !== 1) return;
      if (selected) selected.classList.remove("__aksa_picked__");
      selected = el;
      el.classList.add("__aksa_picked__");
      post({ type: "picked", element: describe(el) });
    },
    true,
  );

  // Anchors are neutralised so a click never navigates the preview away.
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.target !== "aksa-picker") return;

    if (data.type === "set-hover") {
      hoverEnabled = !!data.enabled;
      if (!hoverEnabled) box.style.display = "none";
      document.documentElement.style.cursor = hoverEnabled ? "crosshair" : "";
    }

    if (data.type === "highlight") {
      var result = highlightAll(data.selector, data.kind);
      post({ type: "highlight-result", requestId: data.requestId, count: result.count, error: result.error });
    }

    if (data.type === "clear-highlight") clearMatches();

    if (data.type === "preview") {
      // Resolve a full field plan against the snapshot, exactly as the
      // server-side extractor would, so the preview is honest.
      var out = [];
      var items = [];
      try {
        if (data.itemSelector) {
          items = data.itemKind === "xpath"
            ? (function () {
                var acc = [];
                var r = document.evaluate(data.itemSelector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                for (var i = 0; i < r.snapshotLength; i++) { var n = r.snapshotItem(i); if (n && n.nodeType === 1) acc.push(n); }
                return acc;
              })()
            : Array.prototype.slice.call(document.querySelectorAll(data.itemSelector));
        } else {
          items = [document.documentElement];
        }
      } catch (e) {
        post({ type: "preview-result", requestId: data.requestId, error: e.message, rows: [], itemCount: 0 });
        return;
      }

      var limit = Math.min(items.length, data.limit || 10);
      for (var i = 0; i < limit; i++) {
        var row = {};
        for (var f = 0; f < data.fields.length; f++) {
          var field = data.fields[f];
          var scope = items[i];
          var found = [];
          try {
            if (!field.selector) found = [scope];
            else if (field.selectorKind === "xpath") {
              var expr = field.selector.charAt(0) === "." ? field.selector : (field.selector.indexOf("//") === 0 ? "." + field.selector : field.selector);
              var rr = document.evaluate(expr, scope, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              for (var q = 0; q < rr.snapshotLength; q++) { var nn = rr.snapshotItem(q); if (nn && nn.nodeType === 1) found.push(nn); }
            } else {
              found = Array.prototype.slice.call(scope.querySelectorAll(field.selector));
            }
          } catch (e) {
            found = [];
          }
          var values = found.map(function (n) { return previewValue(n, field.type); }).filter(function (v) { return v !== null && v !== ""; });
          row[field.name] = field.multiple ? values : (values.length ? values[0] : null);
        }
        out.push(row);
      }
      post({ type: "preview-result", requestId: data.requestId, rows: out, itemCount: items.length, error: null });
    }
  });

  post({ type: "ready", elementCount: document.querySelectorAll("[data-aksa-ref]").length });
})();
`;

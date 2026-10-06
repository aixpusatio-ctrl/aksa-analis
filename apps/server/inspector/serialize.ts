/**
 * Serializes a live page into a self-contained, inert HTML snapshot that is
 * safe to serve from our own origin.
 *
 * Everything in this file runs inside the browser via `page.evaluate`, so it
 * must stay self-contained — no imports, no closures over module scope.
 */

export interface SnapshotResult {
  html: string;
  title: string;
  url: string;
  elementCount: number;
  /** Stylesheet URLs that had to stay remote because they are cross-origin. */
  remoteStylesheets: number;
}

/** Attribute stamped on every element so the picker can address it. */
export const REF_ATTRIBUTE = "data-aksa-ref";

export function serializeDocument(): SnapshotResult {
  const REF = "data-aksa-ref";

  const absolutize = (value: string | null): string | null => {
    if (!value) return value;
    const trimmed = value.trim();
    if (/^(data|blob|mailto|tel):/i.test(trimmed)) return trimmed;
    try {
      return new URL(trimmed, document.baseURI).href;
    } catch {
      return trimmed;
    }
  };

  const clone = document.documentElement.cloneNode(true) as HTMLElement;

  // Stamp refs on the live tree first, then mirror them onto the clone by
  // walking both in the same order — the clone has no identity of its own.
  const liveElements = Array.from(document.documentElement.querySelectorAll("*"));
  const clonedElements = Array.from(clone.querySelectorAll("*"));
  let ref = 0;
  for (let i = 0; i < liveElements.length && i < clonedElements.length; i++) {
    const value = String(ref++);
    liveElements[i]!.setAttribute(REF, value);
    clonedElements[i]!.setAttribute(REF, value);
  }

  let remoteStylesheets = 0;

  for (const element of Array.from(clone.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();

    // Scripts never make it into the snapshot: the page must be inert.
    if (tag === "script" || tag === "noscript" || tag === "object" || tag === "embed" || tag === "iframe") {
      element.remove();
      continue;
    }

    // Inline event handlers and javascript: URLs are script by another name.
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === "href" || name === "src" || name === "action" || name === "formaction") && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (tag === "link") {
      const rel = (element.getAttribute("rel") ?? "").toLowerCase();
      if (rel.includes("stylesheet")) {
        element.setAttribute("href", absolutize(element.getAttribute("href")) ?? "");
        remoteStylesheets++;
      } else if (!rel.includes("icon")) {
        element.remove();
        continue;
      }
    }

    for (const name of ["src", "href", "poster", "data-src", "data-original"]) {
      const value = element.getAttribute(name);
      if (value) element.setAttribute(name, absolutize(value) ?? value);
    }

    const srcset = element.getAttribute("srcset");
    if (srcset) {
      element.setAttribute(
        "srcset",
        srcset
          .split(",")
          .map((candidate) => {
            const [url = "", ...rest] = candidate.trim().split(/\s+/);
            return [absolutize(url), ...rest].join(" ");
          })
          .join(", "),
      );
    }

    // Links must not navigate the preview frame away from the snapshot.
    if (tag === "a" || tag === "area") element.setAttribute("target", "_blank");
    if (tag === "form") element.removeAttribute("action");
  }

  // A <base> keeps anything we missed resolving against the original site.
  const head = clone.querySelector("head") ?? clone.insertBefore(document.createElement("head"), clone.firstChild);
  const base = head.querySelector("base") ?? head.insertBefore(document.createElement("base"), head.firstChild);
  base.setAttribute("href", document.baseURI);

  return {
    html: `<!doctype html>\n<html ${Array.from(clone.attributes).map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join(" ")}>${clone.innerHTML}</html>`,
    title: document.title,
    url: location.href,
    elementCount: ref,
    remoteStylesheets,
  };
}

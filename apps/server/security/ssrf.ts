/**
 * Server-Side Request Forgery protection.
 *
 * The scraper and the visual inspector both fetch URLs chosen by whoever is
 * using the app, from inside the server's network. Without a guard that is a
 * direct path to loopback services, private subnets and cloud metadata
 * endpoints, so every outbound target passes through here first.
 *
 * Two layers, because one is not enough:
 *   1. `assertPublicUrl` resolves the hostname and checks every address it
 *      maps to, before navigation starts.
 *   2. `isBlockedAddress` is re-checked per navigation request inside the
 *      browser context, which catches a redirect to a private address that the
 *      pre-flight check could not see.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "../utils/errors.ts";

export class BlockedUrlError extends HttpError {
  constructor(message: string) {
    super(403, message);
    this.name = "BlockedUrlError";
  }
}

/** Hostnames that serve cloud instance credentials. Never reachable. */
const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
]);

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

const inRange = (ip: number, cidr: string): boolean => {
  const [base = "", bitsRaw = "32"] = cidr.split("/");
  const baseIp = parseIpv4(base);
  if (baseIp === null) return false;
  const bits = Number(bitsRaw);
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) >>> 0 === (baseIp & mask) >>> 0;
};

/** Everything that is not routable on the public internet. */
const BLOCKED_IPV4 = [
  "0.0.0.0/8", // "this network"
  "10.0.0.0/8", // private
  "100.64.0.0/10", // carrier-grade NAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local, includes the 169.254.169.254 metadata endpoint
  "172.16.0.0/12", // private
  "192.0.0.0/24", // IETF protocol assignments
  "192.168.0.0/16", // private
  "198.18.0.0/15", // benchmarking
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved, includes 255.255.255.255
];

function isBlockedIpv6(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "";

  // ::ffff:10.0.0.1 and friends are IPv4 wearing a hat.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);

  if (value === "::" || value === "::1") return true; // unspecified, loopback
  if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  if (value.startsWith("fc") || value.startsWith("fd")) return true; // fc00::/7 unique local
  if (value.startsWith("ff")) return true; // ff00::/8 multicast
  return false;
}

function isBlockedIpv4(address: string): boolean {
  const ip = parseIpv4(address);
  if (ip === null) return false;
  return BLOCKED_IPV4.some((cidr) => inRange(ip, cidr));
}

/** True when this literal address must not be reached. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return false;
}

export interface SsrfPolicy {
  /** When true the guard is inert — private addresses are reachable. */
  allowPrivateNetwork: boolean;
  /** Hosts exempted from the guard even when it is active, e.g. `localhost:3100`. */
  allowedHosts: Set<string>;
  /** Whether the setting was chosen explicitly or inferred from NODE_ENV. */
  explicit: boolean;
}

function readPolicy(): SsrfPolicy {
  const raw = process.env.ALLOW_PRIVATE_NETWORK;
  // Unset means "on in development, off in production": local work usually
  // targets a site on localhost, a deployed server never should.
  const allowPrivateNetwork =
    raw === undefined ? process.env.NODE_ENV !== "production" : raw === "1" || raw.toLowerCase() === "true";

  const allowedHosts = new Set(
    (process.env.ALLOWED_PRIVATE_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );

  return { allowPrivateNetwork, allowedHosts, explicit: raw !== undefined };
}

let policy = readPolicy();

/** Re-read the environment. Exposed for tests. */
export function refreshPolicy(): SsrfPolicy {
  policy = readPolicy();
  return policy;
}

export const currentPolicy = (): SsrfPolicy => policy;

function isExempt(url: URL): boolean {
  if (policy.allowPrivateNetwork) return true;
  const host = url.hostname.toLowerCase();
  return policy.allowedHosts.has(host) || policy.allowedHosts.has(url.host.toLowerCase());
}

/**
 * Validate a URL before anything navigates to it.
 *
 * Returns the parsed URL so callers can use the normalized form.
 */
export async function assertPublicUrl(raw: string, label = "URL"): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, `${label} is not a valid URL: ${raw || "(empty)"}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, `${label} must use http or https, got "${url.protocol}"`);
  }

  if (isExempt(url)) return url;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".internal") || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new BlockedUrlError(`${label} points at an internal host (${hostname}), which is not allowed`);
  }

  // A literal address needs no DNS round trip.
  if (isIP(hostname) !== 0) {
    if (isBlockedAddress(hostname)) {
      throw new BlockedUrlError(`${label} points at a private or reserved address (${hostname}), which is not allowed`);
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new HttpError(400, `${label} could not be resolved: ${hostname}`);
  }

  // Every address the name maps to has to be public — a name that resolves to
  // both a public and a private address is a DNS rebinding attempt.
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new BlockedUrlError(
        `${label} resolves to a private or reserved address (${hostname} → ${address}), which is not allowed`,
      );
    }
  }

  return url;
}

/**
 * Per-request check used inside the browser context, where a redirect may have
 * landed somewhere the pre-flight check never saw.
 */
export async function isRequestUrlAllowed(raw: string): Promise<boolean> {
  try {
    await assertPublicUrl(raw);
    return true;
  } catch {
    return false;
  }
}

/** One line for the startup banner, so the active policy is never a surprise. */
export function policyDescription(): string {
  const active = currentPolicy();
  const source = active.explicit ? "ALLOW_PRIVATE_NETWORK" : `default for NODE_ENV=${process.env.NODE_ENV ?? "development"}`;
  if (active.allowPrivateNetwork) return `private networks REACHABLE — SSRF guard off (${source})`;
  const exempt = active.allowedHosts.size;
  return `private networks blocked${exempt > 0 ? `, ${exempt} host(s) exempted` : ""} (${source})`;
}

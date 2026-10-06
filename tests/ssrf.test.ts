import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { assertPublicUrl, isBlockedAddress, refreshPolicy, BlockedUrlError } from "../apps/server/security/ssrf.ts";

const withPolicy = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  refreshPolicy();
  try {
    await fn();
  } finally {
    process.env = previous;
    refreshPolicy();
  }
};

/** The guard is inert in development, so these tests opt into enforcement. */
const enforced = (fn: () => Promise<void>) =>
  withPolicy({ ALLOW_PRIVATE_NETWORK: "0", ALLOWED_PRIVATE_HOSTS: undefined }, fn);

describe("isBlockedAddress", () => {
  test("blocks loopback, private, link-local and reserved IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // AWS/GCP/Azure instance metadata
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
  });

  test("allows ordinary public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "11.0.0.1"]) {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  });

  test("blocks loopback, unique-local and link-local IPv6", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
  });

  test("sees through IPv4-mapped IPv6", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
  });

  test("allows public IPv6", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  test("rejects non-http schemes", async () => {
    await enforced(async () => {
      for (const url of ["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "data:text/html,x"]) {
        expect(assertPublicUrl(url)).rejects.toThrow(/must use http or https/);
      }
    });
  });

  test("rejects malformed URLs", async () => {
    await enforced(async () => {
      expect(assertPublicUrl("not a url")).rejects.toThrow(/not a valid URL/);
    });
  });

  test("blocks loopback by name and by address", async () => {
    await enforced(async () => {
      for (const url of ["http://localhost:3000/", "http://127.0.0.1/", "http://[::1]/", "http://app.localhost/"]) {
        expect(assertPublicUrl(url)).rejects.toThrow(BlockedUrlError);
      }
    });
  });

  test("blocks the cloud metadata endpoints", async () => {
    await enforced(async () => {
      expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(BlockedUrlError);
      expect(assertPublicUrl("http://metadata.google.internal/")).rejects.toThrow(BlockedUrlError);
    });
  });

  test("blocks private subnets", async () => {
    await enforced(async () => {
      for (const url of ["http://10.0.0.5/", "http://192.168.0.1/admin", "http://172.20.1.1:8080/"]) {
        expect(assertPublicUrl(url)).rejects.toThrow(BlockedUrlError);
      }
    });
  });

  test("a port does not sneak a blocked host through", async () => {
    await enforced(async () => {
      expect(assertPublicUrl("http://127.0.0.1:3100/products")).rejects.toThrow(BlockedUrlError);
    });
  });

  test("an explicitly allowed host is exempt", async () => {
    await withPolicy({ ALLOW_PRIVATE_NETWORK: "0", ALLOWED_PRIVATE_HOSTS: "localhost:3100" }, async () => {
      const url = await assertPublicUrl("http://localhost:3100/products");
      expect(url.hostname).toBe("localhost");
      // A different port is still a different host, so it stays blocked.
      expect(assertPublicUrl("http://localhost:9999/")).rejects.toThrow(BlockedUrlError);
    });
  });

  test("the guard is inert when private access is allowed", async () => {
    await withPolicy({ ALLOW_PRIVATE_NETWORK: "1" }, async () => {
      const url = await assertPublicUrl("http://127.0.0.1:3100/x");
      expect(url.port).toBe("3100");
    });
  });

  test("defaults to enforcing in production and permitting in development", async () => {
    await withPolicy({ ALLOW_PRIVATE_NETWORK: undefined, NODE_ENV: "production" }, async () => {
      expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow(BlockedUrlError);
    });
    await withPolicy({ ALLOW_PRIVATE_NETWORK: undefined, NODE_ENV: "development" }, async () => {
      expect((await assertPublicUrl("http://127.0.0.1/")).hostname).toBe("127.0.0.1");
    });
  });

  test("a public hostname resolves and passes", async () => {
    await enforced(async () => {
      const url = await assertPublicUrl("https://example.com/path?q=1");
      expect(url.host).toBe("example.com");
    });
  });
});

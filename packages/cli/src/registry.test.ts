import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { getServer, getBundle, searchServers, getAllServers, getAllBundles } from "./registry.js";

// registry.ts memoizes the loaded registry in a module-level variable, so we
// force offline mode (fetch always rejects) before the very first call in
// this file — every test then exercises the bundled registry.json fallback
// deterministically, with no real network dependency.
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in tests")))
  );
});

describe("getServer", () => {
  it("returns the registry entry for a known server id", async () => {
    const server = await getServer("github");
    expect(server).toBeDefined();
    expect(server?.command).toBeTruthy();
    expect(Array.isArray(server?.args)).toBe(true);
  });

  it("returns undefined for an unknown server id", async () => {
    const server = await getServer("this-server-does-not-exist-xyz");
    expect(server).toBeUndefined();
  });
});

describe("getBundle", () => {
  it("returns a known bundle with its server list", async () => {
    const bundle = await getBundle("webdev");
    expect(bundle).toBeDefined();
    expect(Array.isArray(bundle?.servers)).toBe(true);
    expect(bundle!.servers.length).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown bundle id", async () => {
    const bundle = await getBundle("this-bundle-does-not-exist-xyz");
    expect(bundle).toBeUndefined();
  });
});

describe("searchServers", () => {
  it("matches by server id", async () => {
    const results = await searchServers("github");
    expect(results.some(([id]) => id === "github")).toBe(true);
  });

  it("matches case-insensitively", async () => {
    const lower = await searchServers("github");
    const upper = await searchServers("GITHUB");
    expect(upper.map(([id]) => id)).toEqual(lower.map(([id]) => id));
  });

  it("finds at least one result for a common tag like 'official'", async () => {
    const results = await searchServers("official");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns an empty array for a query matching nothing", async () => {
    const results = await searchServers("zzz-nonexistent-query-zzz");
    expect(results).toEqual([]);
  });

  it("every returned entry actually contains the query somewhere relevant", async () => {
    const query = "database";
    const results = await searchServers(query);
    for (const [id, server] of results) {
      const matches =
        id.includes(query) ||
        server.name.toLowerCase().includes(query) ||
        server.description.toLowerCase().includes(query) ||
        server.tags.some((t) => t.includes(query));
      expect(matches).toBe(true);
    }
  });
});

describe("getAllServers", () => {
  it("returns a non-empty list of [id, server] tuples", async () => {
    const servers = await getAllServers();
    expect(servers.length).toBeGreaterThan(0);
    const [id, server] = servers[0];
    expect(typeof id).toBe("string");
    expect(server).toHaveProperty("command");
    expect(server).toHaveProperty("args");
  });

  it("contains no duplicate server ids", async () => {
    const servers = await getAllServers();
    const ids = servers.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getAllBundles", () => {
  it("returns a non-empty list of [id, bundle] tuples", async () => {
    const bundles = await getAllBundles();
    expect(bundles.length).toBeGreaterThan(0);
  });

  it("every bundle only references server ids that exist in the registry", async () => {
    const bundles = await getAllBundles();
    const servers = await getAllServers();
    const knownIds = new Set(servers.map(([id]) => id));
    for (const [, bundle] of bundles) {
      for (const serverId of bundle.servers) {
        expect(knownIds.has(serverId)).toBe(true);
      }
    }
  });
});

// registry.ts memoizes its loaded registry per module instance, and consults the
// on-disk cache before ever touching the network. These tests need a fresh module
// per scenario (vi.resetModules) with the cache mocked out (vi.doMock), so each one
// exercises loadRegistry()'s network path in isolation from the others and from any
// real ~/.cache/mcp-fleet content on the machine running the suite.
describe("network error handling", () => {
  afterEach(() => {
    vi.doUnmock("./cache.js");
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network disabled in tests")))
    );
  });

  it("falls back to the bundled local registry when every fetch rejects", async () => {
    vi.resetModules();
    vi.doMock("./cache.js", () => ({ readCache: () => null, writeCache: () => {} }));
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));

    const { getServer } = await import("./registry.js");
    const server = await getServer("github");
    expect(server).toBeDefined();
  });

  it("falls back to the bundled local registry when fetch resolves with a non-ok response", async () => {
    vi.resetModules();
    vi.doMock("./cache.js", () => ({ readCache: () => null, writeCache: () => {} }));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response))
    );

    const { getAllServers } = await import("./registry.js");
    const servers = await getAllServers();
    expect(servers.length).toBeGreaterThan(0);
  });

  it("does not throw even when both the version-tagged and main URLs fail", async () => {
    vi.resetModules();
    vi.doMock("./cache.js", () => ({ readCache: () => null, writeCache: () => {} }));
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("DNS lookup failed"))));

    const { getAllBundles } = await import("./registry.js");
    await expect(getAllBundles()).resolves.not.toThrow();
  });

  it("logs a debug warning per failed fetch when MCPM_DEBUG is set", async () => {
    const originalDebug = process.env.MCPM_DEBUG;
    process.env.MCPM_DEBUG = "1";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.resetModules();
    vi.doMock("./cache.js", () => ({ readCache: () => null, writeCache: () => {} }));
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    const { getServer } = await import("./registry.js");
    await getServer("github");

    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    if (originalDebug === undefined) delete process.env.MCPM_DEBUG;
    else process.env.MCPM_DEBUG = originalDebug;
  });

  it("does not log a debug warning when MCPM_DEBUG is unset", async () => {
    delete process.env.MCPM_DEBUG;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.resetModules();
    vi.doMock("./cache.js", () => ({ readCache: () => null, writeCache: () => {} }));
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    const { getServer } = await import("./registry.js");
    await getServer("github");

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

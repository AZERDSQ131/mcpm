import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  resolveTtl,
  readCache,
  writeCache,
  clearCache,
  clearCacheAndStats,
  getCacheStats,
  getHitMissStats,
  resetHitMissStats,
} from "./cache.js";
import type { Registry } from "./types.js";

// cache.ts reads/writes the real ~/.cache/mcp-fleet directory (paths are
// module-level constants derived from os.homedir()), so each test snapshots
// whatever is already there and restores it afterwards instead of touching
// the developer's actual registry cache.
const CACHE_DIR = path.join(os.homedir(), ".cache", "mcp-fleet");
const FILES = ["registry.json", "cache-stats.json", "cache-meta.json"];

function snapshotFiles(): Map<string, string> {
  const snapshot = new Map<string, string>();
  for (const name of FILES) {
    const p = path.join(CACHE_DIR, name);
    if (fs.existsSync(p)) snapshot.set(name, fs.readFileSync(p, "utf-8"));
  }
  return snapshot;
}

function restoreFiles(snapshot: Map<string, string>): void {
  for (const name of FILES) {
    const p = path.join(CACHE_DIR, name);
    if (snapshot.has(name)) {
      fs.writeFileSync(p, snapshot.get(name)!, "utf-8");
    } else if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
}

const SAMPLE_REGISTRY: Registry = { version: "test", servers: {}, bundles: {} };

describe("resolveTtl", () => {
  const ORIGINAL_ENV = process.env.MCPM_CACHE_TTL_MINUTES;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.MCPM_CACHE_TTL_MINUTES;
    else process.env.MCPM_CACHE_TTL_MINUTES = ORIGINAL_ENV;
  });

  it("defaults to 1 hour when the env var is unset", () => {
    delete process.env.MCPM_CACHE_TTL_MINUTES;
    const result = resolveTtl();
    expect(result).toEqual({ ttlMs: 60 * 60 * 1000, source: "default" });
  });

  it("uses the env var (in minutes) when it's a valid positive number", () => {
    process.env.MCPM_CACHE_TTL_MINUTES = "30";
    const result = resolveTtl();
    expect(result).toEqual({ ttlMs: 30 * 60 * 1000, source: "env" });
  });

  it("falls back to the default and reports the invalid value when non-numeric", () => {
    process.env.MCPM_CACHE_TTL_MINUTES = "not-a-number";
    const result = resolveTtl();
    expect(result.source).toBe("default");
    expect(result.ttlMs).toBe(60 * 60 * 1000);
    expect(result.invalidEnvValue).toBe("not-a-number");
  });

  it("falls back to the default when the value is zero or negative", () => {
    process.env.MCPM_CACHE_TTL_MINUTES = "-5";
    const result = resolveTtl();
    expect(result.source).toBe("default");
    expect(result.invalidEnvValue).toBe("-5");
  });
});

describe("readCache / writeCache", () => {
  let before: Map<string, string>;

  beforeEach(() => {
    before = snapshotFiles();
    clearCacheAndStats();
  });

  afterEach(() => {
    restoreFiles(before);
  });

  it("returns null when nothing has been cached yet", () => {
    expect(readCache()).toBeNull();
  });

  it("returns the written registry while it's within the TTL", () => {
    writeCache(SAMPLE_REGISTRY);
    expect(readCache()).toEqual(SAMPLE_REGISTRY);
  });

  it("returns null once the cache is older than its TTL", () => {
    delete process.env.MCPM_CACHE_TTL_MINUTES;
    writeCache(SAMPLE_REGISTRY);

    const filePath = path.join(CACHE_DIR, "registry.json");
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago, TTL is 1h
    fs.utimesSync(filePath, past, past);

    expect(readCache()).toBeNull();
  });

  it("reports isFresh: true right after a write", () => {
    writeCache(SAMPLE_REGISTRY);
    expect(getCacheStats().isFresh).toBe(true);
  });

  it("clearCache deletes the cache file and getCacheStats reports it as absent", () => {
    writeCache(SAMPLE_REGISTRY);
    expect(clearCache()).toBe(true);
    expect(getCacheStats().exists).toBe(false);
    expect(readCache()).toBeNull();
  });

  it("clearCache returns false when there was nothing to clear", () => {
    expect(clearCache()).toBe(false);
  });
});

describe("hit/miss stats", () => {
  let before: Map<string, string>;

  beforeEach(() => {
    before = snapshotFiles();
    clearCacheAndStats();
  });

  afterEach(() => {
    restoreFiles(before);
  });

  it("starts at zero hits and misses", () => {
    expect(getHitMissStats()).toEqual({ hits: 0, misses: 0, hitRate: 0 });
  });

  it("records a miss on readCache when nothing is cached", () => {
    readCache();
    expect(getHitMissStats().misses).toBe(1);
    expect(getHitMissStats().hits).toBe(0);
  });

  it("records a hit on readCache when the cache is fresh", () => {
    writeCache(SAMPLE_REGISTRY);
    readCache();
    expect(getHitMissStats().hits).toBe(1);
  });

  it("computes the hit rate across hits and misses", () => {
    readCache(); // miss
    writeCache(SAMPLE_REGISTRY);
    readCache(); // hit
    readCache(); // hit
    const stats = getHitMissStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it("resetHitMissStats clears the counters", () => {
    readCache();
    expect(resetHitMissStats()).toBe(true);
    expect(getHitMissStats()).toEqual({ hits: 0, misses: 0, hitRate: 0 });
  });
});

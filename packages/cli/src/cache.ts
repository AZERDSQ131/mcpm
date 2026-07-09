import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import type { Registry } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Honors XDG_CACHE_HOME when set (e.g. per-profile setups), falling back to ~/.cache. */
function resolveCacheBaseDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  return xdg && xdg.trim() !== "" ? xdg : path.join(os.homedir(), ".cache");
}

const CACHE_DIR = path.join(resolveCacheBaseDir(), "mcp-fleet");
const CACHE_FILE = path.join(CACHE_DIR, "registry.json");
const STATS_FILE = path.join(CACHE_DIR, "cache-stats.json");
const CACHE_META_FILE = path.join(CACHE_DIR, "cache-meta.json");

/** The installed CLI version, used to auto-invalidate a cache written by a different mcpm version. */
function getCliVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require(path.resolve(__dirname, "../package.json")) as { version: string };
  return pkg.version;
}

const ENV_TTL_MINUTES = "MCPM_CACHE_TTL_MINUTES";

export type TtlSource = "default" | "env";

export interface TtlResolution {
  ttlMs: number;
  source: TtlSource;
  /** Set when MCPM_CACHE_TTL_MINUTES was present but not a usable value. */
  invalidEnvValue?: string;
}

export interface CacheStats {
  exists: boolean;
  path: string;
  sizeBytes: number;
  ageMs: number;
  ttlMs: number;
  ttlSource: TtlSource;
  invalidEnvValue?: string;
  isFresh: boolean;
  /** True when the cache was written by a different mcpm version and was invalidated because of it. */
  invalidatedByVersion?: boolean;
}

function readCachedVersion(): string | null {
  try {
    const raw = fs.readFileSync(CACHE_META_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<{ cliVersion: string }>;
    return parsed.cliVersion ?? null;
  } catch {
    return null;
  }
}

function writeCachedVersion(version: string): void {
  try {
    fs.writeFileSync(CACHE_META_FILE, JSON.stringify({ cliVersion: version }), "utf-8");
  } catch {
    // best-effort; a failure here must never break registry loading
  }
}

/**
 * Resolves the registry cache TTL, along with where it came from.
 * Defaults to 1 hour, overridable via MCPM_CACHE_TTL_MINUTES (minutes).
 */
export function resolveTtl(): TtlResolution {
  const raw = process.env[ENV_TTL_MINUTES];
  if (!raw) {
    return { ttlMs: DEFAULT_CACHE_TTL_MS, source: "default" };
  }

  const minutes = Number.parseInt(raw, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ttlMs: DEFAULT_CACHE_TTL_MS, source: "default", invalidEnvValue: raw };
  }

  return { ttlMs: minutes * 60 * 1000, source: "env" };
}

/** Convenience wrapper when only the TTL value is needed. */
export function getCacheTtlMs(): number {
  return resolveTtl().ttlMs;
}

export function getCachePath(): string {
  return CACHE_FILE;
}

export function getCacheStats(): CacheStats {
  const { ttlMs, source, invalidEnvValue } = resolveTtl();

  if (!fs.existsSync(CACHE_FILE)) {
    return {
      exists: false,
      path: CACHE_FILE,
      sizeBytes: 0,
      ageMs: 0,
      ttlMs,
      ttlSource: source,
      invalidEnvValue,
      isFresh: false,
    };
  }

  const stat = fs.statSync(CACHE_FILE);
  const ageMs = Date.now() - stat.mtimeMs;

  const cachedVersion = readCachedVersion();
  const currentVersion = getCliVersion();
  const invalidatedByVersion = cachedVersion !== null && cachedVersion !== currentVersion;

  return {
    exists: true,
    path: CACHE_FILE,
    sizeBytes: stat.size,
    ageMs,
    ttlMs,
    ttlSource: source,
    invalidEnvValue,
    isFresh: ageMs < ttlMs && !invalidatedByVersion,
    invalidatedByVersion,
  };
}

/**
 * Reads the cached registry if it exists and is still within its TTL.
 * Returns null if the cache is missing, stale, or unreadable.
 */
export function readCache(): Registry | null {
  const stats = getCacheStats();
  if (!stats.exists || !stats.isFresh) {
    recordCacheEvent("miss");
    return null;
  }

  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Registry;
    recordCacheEvent("hit");
    return parsed;
  } catch {
    recordCacheEvent("miss");
    return null;
  }
}

export interface HitMissStats {
  hits: number;
  misses: number;
}

function readStatsFile(): HitMissStats {
  try {
    const raw = fs.readFileSync(STATS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<HitMissStats>;
    return { hits: parsed.hits ?? 0, misses: parsed.misses ?? 0 };
  } catch {
    return { hits: 0, misses: 0 };
  }
}

/** Increments the hit/miss counter used by `mcpm cache stats`. Failures are silent — stats are best-effort. */
function recordCacheEvent(kind: "hit" | "miss"): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const stats = readStatsFile();
    if (kind === "hit") stats.hits += 1;
    else stats.misses += 1;
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats), "utf-8");
  } catch {
    // best-effort; a failure here must never break registry loading
  }
}

/** Returns the accumulated hit/miss counters, along with the hit rate (0 when no events yet). */
export function getHitMissStats(): HitMissStats & { hitRate: number } {
  const stats = readStatsFile();
  const total = stats.hits + stats.misses;
  return { ...stats, hitRate: total === 0 ? 0 : stats.hits / total };
}

/** Resets the hit/miss counters. Returns false if there was nothing to reset. */
export function resetHitMissStats(): boolean {
  if (!fs.existsSync(STATS_FILE)) return false;
  fs.unlinkSync(STATS_FILE);
  return true;
}

export function writeCache(data: Registry): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
  writeCachedVersion(getCliVersion());
}

/** Deletes the cache file (and its version marker). Returns false if there was nothing to delete. */
export function clearCache(): boolean {
  if (fs.existsSync(CACHE_META_FILE)) fs.unlinkSync(CACHE_META_FILE);
  if (!fs.existsSync(CACHE_FILE)) return false;
  fs.unlinkSync(CACHE_FILE);
  return true;
}

/** Deletes both the cache file and the hit/miss counters. Returns false if there was nothing to delete. */
export function clearCacheAndStats(): boolean {
  const clearedCache = clearCache();
  const clearedStats = resetHitMissStats();
  return clearedCache || clearedStats;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

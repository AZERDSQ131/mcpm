import fs from "fs";
import os from "os";
import path from "path";
import type { Registry } from "./types.js";

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_DIR = path.join(os.homedir(), ".cache", "mcp-fleet");
const CACHE_FILE = path.join(CACHE_DIR, "registry.json");

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

  return { ttlMs: minutes, source: "env" };
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

  return {
    exists: true,
    path: CACHE_FILE,
    sizeBytes: stat.size,
    ageMs,
    ttlMs,
    ttlSource: source,
    invalidEnvValue,
    isFresh: ageMs < ttlMs,
  };
}

/**
 * Reads the cached registry if it exists and is still within its TTL.
 * Returns null if the cache is missing, stale, or unreadable.
 */
export function readCache(): Registry | null {
  const stats = getCacheStats();
  if (!stats.exists || !stats.isFresh) return null;

  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as Registry;
  } catch {
    return null;
  }
}

export function writeCache(data: Registry): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** Deletes the cache file. Returns false if there was nothing to delete. */
export function clearCache(): boolean {
  if (!fs.existsSync(CACHE_FILE)) return false;
  fs.unlinkSync(CACHE_FILE);
  return true;
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

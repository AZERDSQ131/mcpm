import fs from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import type { Registry, RegistryServer, RegistryBundle } from "./types.js";
import { readCache, writeCache, getCachePath } from "./cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_BASE_URL = "https://raw.githubusercontent.com/AZERDSQ131/mcpm";
const REGISTRY_SUBPATH = "packages/registry/registry.json";
const LATEST_RELEASE_API_URL = "https://api.github.com/repos/AZERDSQ131/mcpm/releases/latest";

export function registryUrlFor(ref: string): string {
  return `${REGISTRY_BASE_URL}/${ref}/${REGISTRY_SUBPATH}`;
}

export function cliVersionTag(): string {
  const require = createRequire(import.meta.url);
  const pkg = require(path.resolve(__dirname, "../package.json")) as { version: string };
  return `v${pkg.version}`;
}

/**
 * Looks up the latest published GitHub release tag. Used as a middle rung between the
 * CLI's own (possibly unpublished, e.g. a local/prerelease build) version tag and the
 * unstable `main` branch, so a stale local version doesn't force falling all the way
 * back to unreleased registry content.
 */
async function latestStableTag(): Promise<string | null> {
  try {
    const res = await fetch(LATEST_RELEASE_API_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ?? null;
  } catch {
    return null;
  }
}

let _registry: Registry | null = null;

export async function loadRegistry(): Promise<Registry> {
  if (_registry) return _registry;
  const live = await fetchLive();
  const local = loadLocal();
  // Merge: prefer live servers, but use local bundles if live doesn't have them
  if (live) {
    _registry = {
      ...live,
      bundles: Object.keys(live.bundles ?? {}).length > 0 ? live.bundles : local.bundles,
    };
  } else {
    _registry = local;
  }
  return _registry;
}

async function fetchLive(): Promise<Registry | null> {
  const cached = readCache();
  if (cached) return cached;

  const versionTag = cliVersionTag();
  let data = await tryFetch(registryUrlFor(versionTag));

  if (!data) {
    const stableTag = await latestStableTag();
    if (stableTag && stableTag !== versionTag) {
      data = await tryFetch(registryUrlFor(stableTag));
    }
  }

  data = data ?? (await tryFetch(registryUrlFor("main")));
  if (!data) return null;

  warnIfDivergedFromCache(data);
  writeCache(data);
  return data;
}

/** Reads whatever is on disk right now, ignoring TTL — used only to compare against a fresh fetch. */
function readStaleCache(): Registry | null {
  try {
    return JSON.parse(fs.readFileSync(getCachePath(), "utf-8")) as Registry;
  } catch {
    return null;
  }
}

/**
 * Warns when a freshly fetched registry differs from what was previously cached — a
 * signal that the registry changed upstream since the cache was last populated.
 */
function warnIfDivergedFromCache(fresh: Registry): void {
  const previous = readStaleCache();
  if (!previous) return;

  if (previous.version !== fresh.version) {
    console.warn(
      `[mcpm] registry updated since last cache: v${previous.version} → v${fresh.version}`
    );
    return;
  }

  const previousIds = new Set(Object.keys(previous.servers));
  const freshIds = new Set(Object.keys(fresh.servers));
  if (previousIds.size !== freshIds.size || [...previousIds].some((id) => !freshIds.has(id))) {
    console.warn("[mcpm] registry contents changed since last cache (same version, different servers)");
  }
}

async function tryFetch(url: string): Promise<Registry | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      if (process.env.MCPM_DEBUG) {
        console.warn(`[mcpm] registry fetch failed: HTTP ${res.status} (${url})`);
      }
      return null;
    }
    return (await res.json()) as Registry;
  } catch (err) {
    if (process.env.MCPM_DEBUG) {
      console.warn(`[mcpm] registry fetch failed: ${(err as Error).message} (${url})`);
    }
    return null;
  }
}

function loadLocal(): Registry {
  const require = createRequire(import.meta.url);
  const registryPath = path.resolve(__dirname, "../registry.json");
  return require(registryPath) as Registry;
}

export async function getServer(id: string): Promise<RegistryServer | undefined> {
  const registry = await loadRegistry();
  return registry.servers[id];
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Suggests the closest known server ID for a typo'd input, or undefined if nothing is close enough. */
export async function suggestServer(id: string): Promise<string | undefined> {
  const servers = await getAllServers();
  let best: { id: string; distance: number } | undefined;
  for (const [candidateId] of servers) {
    const distance = levenshtein(id.toLowerCase(), candidateId.toLowerCase());
    if (!best || distance < best.distance) {
      best = { id: candidateId, distance };
    }
  }
  const maxAllowedDistance = Math.max(2, Math.floor(id.length / 3));
  return best && best.distance <= maxAllowedDistance ? best.id : undefined;
}

export async function getBundle(id: string): Promise<RegistryBundle | undefined> {
  const registry = await loadRegistry();
  return registry.bundles?.[id];
}

export async function searchServers(query: string): Promise<Array<[string, RegistryServer]>> {
  const registry = await loadRegistry();
  const q = query.toLowerCase();
  return Object.entries(registry.servers).filter(([id, server]) => {
    return (
      id.includes(q) ||
      server.name.toLowerCase().includes(q) ||
      server.description.toLowerCase().includes(q) ||
      server.tags.some((t) => t.includes(q))
    );
  });
}

export async function getAllServers(): Promise<Array<[string, RegistryServer]>> {
  const registry = await loadRegistry();
  return Object.entries(registry.servers);
}

export async function getAllBundles(): Promise<Array<[string, RegistryBundle]>> {
  const registry = await loadRegistry();
  return Object.entries(registry.bundles ?? {});
}

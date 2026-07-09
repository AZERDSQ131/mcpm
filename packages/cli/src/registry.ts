import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import type { Registry, RegistryServer, RegistryBundle } from "./types.js";
import { readCache, writeCache } from "./cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_URL =
  "https://raw.githubusercontent.com/AZERDSQ131/mcpm/main/packages/registry/registry.json";

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

  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      if (process.env.MCPM_DEBUG) {
        console.warn(`[mcpm] registry fetch failed: HTTP ${res.status}`);
      }
      return null;
    }
    const data = (await res.json()) as Registry;
    writeCache(data);
    return data;
  } catch (err) {
    if (process.env.MCPM_DEBUG) {
      console.warn(`[mcpm] registry fetch failed: ${(err as Error).message}`);
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

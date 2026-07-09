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
    if (!res.ok) return null;
    const data = (await res.json()) as Registry;
    writeCache(data);
    return data;
  } catch {
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

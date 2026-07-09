import { createRequire } from "module";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import path from "path";
import type { Registry, RegistryServer, RegistryBundle } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_BASE_URL = "https://raw.githubusercontent.com/AZERDSQ131/mcpm";
const REGISTRY_SUBPATH = "packages/registry/registry.json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function registryUrlFor(ref: string): string {
  return `${REGISTRY_BASE_URL}/${ref}/${REGISTRY_SUBPATH}`;
}

function cliVersionTag(): string {
  const require = createRequire(import.meta.url);
  const pkg = require(path.resolve(__dirname, "../package.json")) as { version: string };
  return `v${pkg.version}`;
}
const CACHE_PATH = path.join(os.homedir(), ".cache", "mcp-fleet", "registry.json");

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
  // Return cache if fresh
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const stat = fs.statSync(CACHE_PATH);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const cached = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
        return cached as Registry;
      }
    } catch {}
  }

  const versionedUrl = registryUrlFor(cliVersionTag());
  const data = (await tryFetch(versionedUrl)) ?? (await tryFetch(registryUrlFor("main")));
  if (!data) return null;

  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), "utf-8");
  return data;
}

async function tryFetch(url: string): Promise<Registry | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return (await res.json()) as Registry;
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

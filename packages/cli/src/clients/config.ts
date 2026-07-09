import fs from "fs";
import path from "path";
import type { ClientConfig, McpServerConfig, DetectedClient } from "../types.js";

// Zed uses a different key and structure than all other clients
function getServersKey(client: DetectedClient): string {
  return client.id === "zed" ? "context_servers" : "mcpServers";
}

export function readConfig(client: DetectedClient): ClientConfig {
  if (!fs.existsSync(client.configPath)) {
    return { mcpServers: {} };
  }
  try {
    const raw = fs.readFileSync(client.configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const key = getServersKey(client);
    if (!parsed[key]) parsed[key] = {};
    // Normalize to internal format
    return { mcpServers: parseServers(client, parsed[key]) };
  } catch {
    return { mcpServers: {} };
  }
}

function parseServers(
  client: DetectedClient,
  raw: Record<string, unknown>
): Record<string, McpServerConfig> {
  if (client.id !== "zed") return raw as Record<string, McpServerConfig>;
  // Zed format: { command: { path, args }, env }
  const result: Record<string, McpServerConfig> = {};
  for (const [id, val] of Object.entries(raw)) {
    const v = val as Record<string, unknown>;
    const cmd = v["command"] as Record<string, unknown> | undefined;
    result[id] = {
      command: (cmd?.["path"] as string) ?? "",
      args: (cmd?.["args"] as string[]) ?? [],
      env: (v["env"] as Record<string, string>) ?? undefined,
    };
  }
  return result;
}

export function writeConfig(client: DetectedClient, config: ClientConfig): void {
  const dir = path.dirname(client.configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = renderConfigContent(client, config);
  const tmpPath = `${client.configPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, client.configPath);
}

export function renderConfigContent(client: DetectedClient, config: ClientConfig): string {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(client.configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(client.configPath, "utf-8"));
    } catch {
      const backupPath = backupInvalidConfig(client.configPath);
      console.warn(
        backupPath
          ? `[mcpm] Warning: ${client.configPath} contained invalid JSON — backed up to ${backupPath} and will be overwritten.`
          : `[mcpm] Warning: ${client.configPath} contained invalid JSON and will be overwritten.`
      );
    }
  }

  const key = getServersKey(client);
  existing[key] = serializeServers(client, config.mcpServers);
  return JSON.stringify(existing, null, 2) + "\n";
}

/** Copies an unparseable config file to `<path>.bak` so its content isn't lost when overwritten. Returns the backup path, or null if the copy failed. */
function backupInvalidConfig(configPath: string): string | null {
  const backupPath = `${configPath}.bak`;
  try {
    fs.copyFileSync(configPath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

function serializeServers(
  client: DetectedClient,
  servers: Record<string, McpServerConfig>
): unknown {
  if (client.id === "zed") {
    const result: Record<string, unknown> = {};
    for (const [id, s] of Object.entries(servers)) {
      result[id] = {
        command: { path: s.command, args: s.args },
        ...(s.env && { env: s.env }),
      };
    }
    return result;
  }
  if (client.id === "claude") {
    const result: Record<string, unknown> = {};
    for (const [id, s] of Object.entries(servers)) {
      result[id] = { type: "stdio", command: s.command, args: s.args, ...(s.env && { env: s.env }) };
    }
    return result;
  }
  return servers;
}

export function addServer(
  client: DetectedClient,
  serverId: string,
  serverConfig: McpServerConfig
): void {
  const config = readConfig(client);
  config.mcpServers[serverId] = serverConfig;
  writeConfig(client, config);
}

export function removeServer(client: DetectedClient, serverId: string): boolean {
  const config = readConfig(client);
  if (!config.mcpServers[serverId]) return false;
  delete config.mcpServers[serverId];
  writeConfig(client, config);
  return true;
}

export function listInstalledServers(client: DetectedClient): Record<string, McpServerConfig> {
  const config = readConfig(client);
  return config.mcpServers;
}

import fs from "fs";
import path from "path";
import type { ClientConfig, McpServerConfig, DetectedClient } from "../types.js";

export function readConfig(client: DetectedClient): ClientConfig {
  if (!fs.existsSync(client.configPath)) {
    return { mcpServers: {} };
  }
  try {
    const raw = fs.readFileSync(client.configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.mcpServers) parsed.mcpServers = {};
    return parsed as ClientConfig;
  } catch {
    return { mcpServers: {} };
  }
}

export function writeConfig(client: DetectedClient, config: ClientConfig): void {
  const dir = path.dirname(client.configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(client.configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function buildServerConfig(client: DetectedClient, serverConfig: McpServerConfig): McpServerConfig {
  if (client.id === "claude") {
    return { type: "stdio", ...serverConfig } as McpServerConfig;
  }
  return serverConfig;
}

export function addServer(
  client: DetectedClient,
  serverId: string,
  serverConfig: McpServerConfig
): void {
  const config = readConfig(client);
  config.mcpServers[serverId] = buildServerConfig(client, serverConfig);
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

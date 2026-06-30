import fs from "fs";
import os from "os";
import path from "path";
import type { DetectedClient } from "../types.js";

const home = os.homedir();

const CLIENTS: DetectedClient[] = [
  {
    id: "claude",
    name: "Claude Code",
    configPath: path.join(home, ".claude.json"),
    detected: false,
  },
  {
    id: "cursor",
    name: "Cursor",
    configPath: path.join(home, ".cursor", "mcp.json"),
    detected: false,
  },
  {
    id: "vscode",
    name: "VS Code Copilot",
    configPath: path.join(home, ".vscode", "mcp.json"),
    detected: false,
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    configPath: path.join(home, ".codex", "config.json"),
    detected: false,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    configPath: path.join(home, ".codeium", "windsurf", "mcp_config.json"),
    detected: false,
  },
];

export function detectClients(): DetectedClient[] {
  return CLIENTS.map((client) => {
    const configDir = path.dirname(client.configPath);
    const detected =
      fs.existsSync(client.configPath) || fs.existsSync(configDir);
    return { ...client, detected };
  });
}

export function getDetectedClients(): DetectedClient[] {
  return detectClients().filter((c) => c.detected);
}

import fs from "fs";
import os from "os";
import path from "path";
import type { DetectedClient } from "../types.js";

const home = os.homedir();
const appSupport = path.join(home, "Library", "Application Support");

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
  {
    id: "zed",
    name: "Zed",
    configPath: path.join(home, ".config", "zed", "settings.json"),
    detected: false,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    configPath: path.join(home, ".gemini", "settings.json"),
    detected: false,
  },
  {
    id: "cline",
    name: "Cline",
    configPath: path.join(
      appSupport,
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json"
    ),
    detected: false,
  },
  {
    id: "continue",
    name: "Continue",
    configPath: path.join(home, ".continue", "config.json"),
    detected: false,
  },
];

export function detectClients(): DetectedClient[] {
  return CLIENTS.map((client) => {
    const detected = fs.existsSync(client.configPath);
    return { ...client, detected };
  });
}

export function getDetectedClients(): DetectedClient[] {
  return detectClients().filter((c) => c.detected);
}

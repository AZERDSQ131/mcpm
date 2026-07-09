import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  readConfig,
  writeConfig,
  renderConfigContent,
  addServer,
  removeServer,
  listInstalledServers,
} from "./config.js";
import type { DetectedClient, ClientConfig, McpServerConfig } from "../types.js";

function makeClient(id: string, configPath: string): DetectedClient {
  return { id, name: id, configPath, detected: true };
}

function tmpConfigPath(): string {
  return path.join(os.tmpdir(), `mcpm-config-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
}

const sampleServer: McpServerConfig = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: "sk-test" },
};

describe("readConfig", () => {
  let configPath: string;

  beforeEach(() => {
    configPath = tmpConfigPath();
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    if (fs.existsSync(`${configPath}.bak`)) fs.unlinkSync(`${configPath}.bak`);
  });

  it("returns an empty config when the file does not exist", () => {
    const client = makeClient("cursor", configPath);
    const config = readConfig(client);
    expect(config).toEqual({ mcpServers: {} });
  });

  it("returns an empty config when the file contains invalid JSON", () => {
    fs.writeFileSync(configPath, "{ not valid json", "utf-8");
    const client = makeClient("cursor", configPath);
    const config = readConfig(client);
    expect(config).toEqual({ mcpServers: {} });
  });

  it("reads standard mcpServers format for non-zed clients", () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          github: { command: "npx", args: ["-y", "server-github"] },
        },
      }),
      "utf-8"
    );
    const client = makeClient("cursor", configPath);
    const config = readConfig(client);
    expect(config.mcpServers.github).toEqual({ command: "npx", args: ["-y", "server-github"] });
  });

  it("normalizes Zed's context_servers format into the internal shape", () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        context_servers: {
          github: {
            command: { path: "npx", args: ["-y", "server-github"] },
            env: { TOKEN: "abc" },
          },
        },
      }),
      "utf-8"
    );
    const client = makeClient("zed", configPath);
    const config = readConfig(client);
    expect(config.mcpServers.github).toEqual({
      command: "npx",
      args: ["-y", "server-github"],
      env: { TOKEN: "abc" },
    });
  });

  it("handles a Zed entry with a missing command block gracefully", () => {
    fs.writeFileSync(configPath, JSON.stringify({ context_servers: { broken: {} } }), "utf-8");
    const client = makeClient("zed", configPath);
    const config = readConfig(client);
    expect(config.mcpServers.broken).toEqual({ command: "", args: [], env: undefined });
  });

  it("treats a missing mcpServers key as an empty server map, not an error", () => {
    fs.writeFileSync(configPath, JSON.stringify({ someOtherKey: true }), "utf-8");
    const client = makeClient("cursor", configPath);
    const config = readConfig(client);
    expect(config.mcpServers).toEqual({});
  });
});

describe("renderConfigContent", () => {
  let configPath: string;

  beforeEach(() => {
    configPath = tmpConfigPath();
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    if (fs.existsSync(`${configPath}.bak`)) fs.unlinkSync(`${configPath}.bak`);
  });

  it("preserves unrelated top-level keys already in the file", () => {
    fs.writeFileSync(configPath, JSON.stringify({ someOtherSetting: 42 }), "utf-8");
    const client = makeClient("cursor", configPath);
    const config: ClientConfig = { mcpServers: { github: sampleServer } };
    const rendered = JSON.parse(renderConfigContent(client, config));
    expect(rendered.someOtherSetting).toBe(42);
    expect(rendered.mcpServers.github).toBeDefined();
  });

  it("falls back to an empty object when existing content is invalid JSON", () => {
    fs.writeFileSync(configPath, "not json at all", "utf-8");
    const client = makeClient("cursor", configPath);
    const rendered = JSON.parse(renderConfigContent(client, { mcpServers: {} }));
    expect(rendered).toEqual({ mcpServers: {} });
  });

  it("backs up invalid JSON to <path>.bak before overwriting", () => {
    fs.writeFileSync(configPath, "{ this is not valid json", "utf-8");
    const client = makeClient("cursor", configPath);
    renderConfigContent(client, { mcpServers: {} });

    expect(fs.existsSync(`${configPath}.bak`)).toBe(true);
    expect(fs.readFileSync(`${configPath}.bak`, "utf-8")).toBe("{ this is not valid json");
  });

  it("does not create a .bak file when the existing config is valid JSON", () => {
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }), "utf-8");
    const client = makeClient("cursor", configPath);
    renderConfigContent(client, { mcpServers: {} });
    expect(fs.existsSync(`${configPath}.bak`)).toBe(false);
  });

  it("does not create a .bak file when there is no existing config", () => {
    const client = makeClient("cursor", configPath);
    renderConfigContent(client, { mcpServers: {} });
    expect(fs.existsSync(`${configPath}.bak`)).toBe(false);
  });

  it("drops a server missing a command before writing", () => {
    const client = makeClient("cursor", configPath);
    const broken = { args: ["-y", "x"] } as unknown as McpServerConfig;
    const rendered = JSON.parse(renderConfigContent(client, { mcpServers: { broken } }));
    expect(rendered.mcpServers.broken).toBeUndefined();
  });

  it("drops a server whose args is not an array before writing", () => {
    const client = makeClient("cursor", configPath);
    const broken = { command: "npx", args: "not-an-array" } as unknown as McpServerConfig;
    const rendered = JSON.parse(renderConfigContent(client, { mcpServers: { broken } }));
    expect(rendered.mcpServers.broken).toBeUndefined();
  });

  it("keeps valid servers alongside a dropped invalid one", () => {
    const client = makeClient("cursor", configPath);
    const broken = { args: [] } as unknown as McpServerConfig;
    const rendered = JSON.parse(
      renderConfigContent(client, { mcpServers: { github: sampleServer, broken } })
    );
    expect(rendered.mcpServers.github).toBeDefined();
    expect(rendered.mcpServers.broken).toBeUndefined();
  });

  it("serializes Claude's format with a stdio type field", () => {
    const client = makeClient("claude", configPath);
    const rendered = JSON.parse(renderConfigContent(client, { mcpServers: { github: sampleServer } }));
    expect(rendered.mcpServers.github).toEqual({
      type: "stdio",
      command: sampleServer.command,
      args: sampleServer.args,
      env: sampleServer.env,
    });
  });

  it("serializes Zed's format under context_servers with nested command", () => {
    const client = makeClient("zed", configPath);
    const rendered = JSON.parse(renderConfigContent(client, { mcpServers: { github: sampleServer } }));
    expect(rendered.context_servers.github).toEqual({
      command: { path: sampleServer.command, args: sampleServer.args },
      env: sampleServer.env,
    });
  });

  it("omits the env key entirely for servers without env vars", () => {
    const client = makeClient("claude", configPath);
    const noEnvServer: McpServerConfig = { command: "npx", args: ["-y", "x"] };
    const rendered = JSON.parse(renderConfigContent(client, { mcpServers: { x: noEnvServer } }));
    expect(rendered.mcpServers.x.env).toBeUndefined();
  });

  it("ends the output with a trailing newline", () => {
    const client = makeClient("cursor", configPath);
    const rendered = renderConfigContent(client, { mcpServers: {} });
    expect(rendered.endsWith("\n")).toBe(true);
  });
});

describe("writeConfig", () => {
  let configPath: string;

  beforeEach(() => {
    configPath = path.join(os.tmpdir(), `mcpm-config-test-nested-${process.pid}-${Math.random().toString(36).slice(2)}`, "config.json");
  });

  afterEach(() => {
    const dir = path.dirname(configPath);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates parent directories that do not exist yet", () => {
    const client = makeClient("cursor", configPath);
    writeConfig(client, { mcpServers: { github: sampleServer } });
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("writes content that can be read back via readConfig", () => {
    const client = makeClient("cursor", configPath);
    writeConfig(client, { mcpServers: { github: sampleServer } });
    const reRead = readConfig(client);
    expect(reRead.mcpServers.github).toEqual(sampleServer);
  });
});

describe("addServer / removeServer / listInstalledServers", () => {
  let configPath: string;

  beforeEach(() => {
    configPath = tmpConfigPath();
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    if (fs.existsSync(`${configPath}.bak`)) fs.unlinkSync(`${configPath}.bak`);
  });

  it("adds a server that can then be listed", () => {
    const client = makeClient("cursor", configPath);
    addServer(client, "github", sampleServer);
    expect(listInstalledServers(client).github).toEqual(sampleServer);
  });

  it("overwrites an existing server with the same id", () => {
    const client = makeClient("cursor", configPath);
    addServer(client, "github", sampleServer);
    const updated: McpServerConfig = { command: "docker", args: ["run", "x"] };
    addServer(client, "github", updated);
    expect(listInstalledServers(client).github).toEqual(updated);
  });

  it("removes an installed server and returns true", () => {
    const client = makeClient("cursor", configPath);
    addServer(client, "github", sampleServer);
    const removed = removeServer(client, "github");
    expect(removed).toBe(true);
    expect(listInstalledServers(client).github).toBeUndefined();
  });

  it("returns false when removing a server that isn't installed", () => {
    const client = makeClient("cursor", configPath);
    const removed = removeServer(client, "nonexistent");
    expect(removed).toBe(false);
  });

  it("keeps other installed servers untouched when adding one", () => {
    const client = makeClient("cursor", configPath);
    addServer(client, "github", sampleServer);
    addServer(client, "postgres", { command: "npx", args: ["-y", "server-postgres"] });
    const installed = listInstalledServers(client);
    expect(Object.keys(installed).sort()).toEqual(["github", "postgres"]);
  });
});

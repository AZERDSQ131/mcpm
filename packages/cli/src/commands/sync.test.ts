import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  buildTargetReceipt,
  comparableConfig,
  readRC,
  writeRC,
  addToRC,
  normalizePinnedServers,
} from "./sync.js";
import { readConfig, writeConfig } from "../clients/config.js";
import type { DetectedClient, McpServerConfig } from "../types.js";

function makeClient(id: string, configPath: string, detected = true): DetectedClient {
  return { id, name: id, configPath, detected };
}

function tmpConfigPath(): string {
  return path.join(
    os.tmpdir(),
    `mcpm-sync-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );
}

function tmpWorkDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcpm-sync-rc-test-"));
}

const sampleServer: McpServerConfig = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: "sk-test" },
};

describe("comparableConfig", () => {
  it("keeps only command and args, dropping env and type", () => {
    const withExtras: McpServerConfig = {
      type: "stdio",
      command: "npx",
      args: ["-y", "x"],
      env: { TOKEN: "abc" },
    };
    expect(comparableConfig(withExtras)).toEqual({ command: "npx", args: ["-y", "x"] });
  });

  it("defaults a missing args array to []", () => {
    const noArgs = { command: "npx" } as unknown as McpServerConfig;
    expect(comparableConfig(noArgs)).toEqual({ command: "npx", args: [] });
  });

  it("treats two servers differing only by env as identical", () => {
    const a: McpServerConfig = { command: "npx", args: ["-y", "x"], env: { T: "1" } };
    const b: McpServerConfig = { command: "npx", args: ["-y", "x"] };
    expect(JSON.stringify(comparableConfig(a))).toBe(JSON.stringify(comparableConfig(b)));
  });
});

describe("buildTargetReceipt — undetected clients", () => {
  it("returns an empty scaffold with null hashes when the client is not detected", () => {
    const client = makeClient("cursor", "/nowhere/mcp.json", false);
    const receipt = buildTargetReceipt(client, { github: sampleServer }, {});
    expect(receipt.detected).toBe(false);
    expect(receipt.added_servers).toEqual([]);
    expect(receipt.changed_servers).toEqual([]);
    expect(receipt.unchanged_servers).toEqual([]);
    expect(receipt.missing_env).toEqual([]);
    expect(receipt.before_hash).toBeNull();
    expect(receipt.proposed_hash).toBeNull();
  });
});

describe("buildTargetReceipt — drift detection", () => {
  let configPaths: string[];

  beforeEach(() => {
    configPaths = [];
  });

  afterEach(() => {
    for (const p of configPaths) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
      if (fs.existsSync(`${p}.bak`)) fs.unlinkSync(`${p}.bak`);
    }
  });

  function trackedPath(): string {
    const p = tmpConfigPath();
    configPaths.push(p);
    return p;
  }

  it("reports a desired server absent from the current config as added", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    const receipt = buildTargetReceipt(client, { github: sampleServer }, {});
    expect(receipt.added_servers).toEqual(["github"]);
    expect(receipt.changed_servers).toEqual([]);
    expect(receipt.unchanged_servers).toEqual([]);
  });

  it("reports an identical server as unchanged", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    writeConfig(client, { mcpServers: { github: sampleServer } });
    const receipt = buildTargetReceipt(client, { github: sampleServer }, {});
    expect(receipt.unchanged_servers).toEqual(["github"]);
    expect(receipt.added_servers).toEqual([]);
    expect(receipt.changed_servers).toEqual([]);
  });

  it("ignores env-only differences when classifying unchanged", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    writeConfig(client, {
      mcpServers: { github: { command: "npx", args: ["-y", "x"] } },
    });
    const desired = { github: { command: "npx", args: ["-y", "x"], env: { T: "1" } } };
    const receipt = buildTargetReceipt(client, desired, {});
    expect(receipt.unchanged_servers).toEqual(["github"]);
    expect(receipt.changed_servers).toEqual([]);
  });

  it("reports a server with different args as changed", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    writeConfig(client, { mcpServers: { github: { command: "npx", args: ["-y", "old"] } } });
    const receipt = buildTargetReceipt(
      client,
      { github: { command: "npx", args: ["-y", "new"] } },
      {}
    );
    expect(receipt.changed_servers).toEqual(["github"]);
    expect(receipt.unchanged_servers).toEqual([]);
  });

  it("reports a server with a different command as changed", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    writeConfig(client, { mcpServers: { github: { command: "npx", args: ["x"] } } });
    const receipt = buildTargetReceipt(client, { github: { command: "docker", args: ["x"] } }, {});
    expect(receipt.changed_servers).toEqual(["github"]);
  });

  it("sorts added/changed/unchanged lists", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    writeConfig(client, {
      mcpServers: {
        same: { command: "npx", args: ["same"] },
        stale: { command: "npx", args: ["old"] },
      },
    });
    const receipt = buildTargetReceipt(
      client,
      {
        zebra: { command: "npx", args: ["z"] },
        stale: { command: "npx", args: ["new"] },
        same: { command: "npx", args: ["same"] },
        alpha: { command: "npx", args: ["a"] },
      },
      {}
    );
    expect(receipt.added_servers).toEqual(["alpha", "zebra"]);
    expect(receipt.changed_servers).toEqual(["stale"]);
    expect(receipt.unchanged_servers).toEqual(["same"]);
  });
});

describe("buildTargetReceipt — required env", () => {
  let configPaths: string[];

  beforeEach(() => {
    configPaths = [];
  });

  afterEach(() => {
    for (const p of configPaths) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
      if (fs.existsSync(`${p}.bak`)) fs.unlinkSync(`${p}.bak`);
    }
  });

  function trackedPath(): string {
    const p = tmpConfigPath();
    configPaths.push(p);
    return p;
  }

  it("reports required keys missing from the current config", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    writeConfig(client, { mcpServers: { github: { command: "npx", args: [] } } });
    const receipt = buildTargetReceipt(
      client,
      { github: { command: "npx", args: [] } },
      { github: ["GITHUB_PERSONAL_ACCESS_TOKEN"] }
    );
    expect(receipt.missing_env).toEqual([
      { server_id: "github", keys: ["GITHUB_PERSONAL_ACCESS_TOKEN"] },
    ]);
  });

  it("reports nothing when every required key is already set", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    writeConfig(client, { mcpServers: { github: sampleServer } });
    const receipt = buildTargetReceipt(
      client,
      { github: { command: sampleServer.command, args: sampleServer.args } },
      { github: ["GITHUB_PERSONAL_ACCESS_TOKEN"] }
    );
    expect(receipt.missing_env).toEqual([]);
  });

  it("only lists the keys that are actually missing", () => {
    const configPath = trackedPath();
    const client = makeClient("cursor", configPath);
    writeConfig(client, {
      mcpServers: { github: { command: "npx", args: [], env: { PRESENT: "1" } } },
    });
    const receipt = buildTargetReceipt(
      client,
      { github: { command: "npx", args: [] } },
      { github: ["PRESENT", "ABSENT"] }
    );
    expect(receipt.missing_env).toEqual([{ server_id: "github", keys: ["ABSENT"] }]);
  });
});

describe("buildTargetReceipt — hashes", () => {
  let configPaths: string[];

  beforeEach(() => {
    configPaths = [];
  });

  afterEach(() => {
    for (const p of configPaths) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
      if (fs.existsSync(`${p}.bak`)) fs.unlinkSync(`${p}.bak`);
    }
  });

  it("uses null before_hash for a missing file but always hashes the proposal", () => {
    const p = tmpConfigPath();
    configPaths.push(p);
    const client = makeClient("cursor", p);
    const receipt = buildTargetReceipt(client, { github: sampleServer }, {});
    expect(receipt.before_hash).toBeNull();
    expect(receipt.proposed_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("hashes the existing file content as before_hash", () => {
    const configPath = tmpConfigPath();
    configPaths.push(configPath);
    const client = makeClient("cursor", configPath);
    writeConfig(client, { mcpServers: {} });
    const receipt = buildTargetReceipt(client, { github: sampleServer }, {});
    expect(receipt.before_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.proposed_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.proposed_hash).not.toBe(receipt.before_hash);
  });

  it("produces a stable proposed_hash for identical inputs", () => {
    const configPath = tmpConfigPath();
    configPaths.push(configPath);
    const client = makeClient("cursor", configPath);
    const desired = { github: sampleServer };
    const first = buildTargetReceipt(client, desired, {});
    const second = buildTargetReceipt(client, desired, {});
    expect(first.proposed_hash).toBe(second.proposed_hash);
  });
});

describe("readConfig round-trip (cursor)", () => {
  let configPaths: string[];

  beforeEach(() => {
    configPaths = [];
  });

  afterEach(() => {
    for (const p of configPaths) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
      if (fs.existsSync(`${p}.bak`)) fs.unlinkSync(`${p}.bak`);
    }
  });

  it("round-trips a server through writeConfig/readConfig", () => {
    const p = tmpConfigPath();
    configPaths.push(p);
    const client = makeClient("cursor", p);
    writeConfig(client, { mcpServers: { github: sampleServer } });
    expect(readConfig(client).mcpServers.github).toEqual(sampleServer);
  });
});

describe("readRC / writeRC / addToRC", () => {
  let dirs: string[];

  beforeEach(() => {
    dirs = [];
  });

  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  function trackedDir(): string {
    const dir = tmpWorkDir();
    dirs.push(dir);
    return dir;
  }

  it("returns null when no .mcpmrc exists in the directory", () => {
    expect(readRC(trackedDir())).toBeNull();
  });

  it("round-trips the server list through writeRC/readRC", () => {
    const dir = trackedDir();
    writeRC({ servers: ["github", "postgres"] }, dir);
    expect(readRC(dir)).toEqual({ servers: ["github", "postgres"] });
  });

  it("appends a server without duplicating an existing entry", () => {
    const dir = trackedDir();
    writeRC({ servers: ["github"] }, dir);
    addToRC("github", "latest", dir);
    addToRC("postgres", "latest", dir);
    expect(readRC(dir)).toEqual({ servers: ["github", "postgres"] });
  });

  it("normalizes the legacy array format to latest pins", () => {
    expect(normalizePinnedServers(["github"])).toEqual([{ id: "github", version: "latest" }]);
  });

  it("normalizes the record format, defaulting empty versions to latest", () => {
    expect(normalizePinnedServers({ github: "1.2.0", postgres: "" })).toEqual([
      { id: "github", version: "1.2.0" },
      { id: "postgres", version: "latest" },
    ]);
  });

  it("upgrades to record format when a pin is added", () => {
    const dir = trackedDir();
    writeRC({ servers: ["github"] }, dir);
    addToRC("github", "1.2.0", dir);
    expect(readRC(dir)).toEqual({ servers: { github: "1.2.0" } });
  });
});

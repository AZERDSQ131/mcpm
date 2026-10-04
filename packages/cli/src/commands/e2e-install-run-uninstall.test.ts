import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { DetectedClient, RegistryServer } from "../types.js";

// End-to-end test of the full install -> run -> uninstall lifecycle.
// Only true external boundaries are mocked (registry network calls, client
// detection, the interactive prompt library, and the child process spawned by
// `run`) — `clients/config.js` (addServer/removeServer/listInstalledServers) is
// the REAL implementation, writing to and reading from a real temp file, so
// this test actually exercises persistence across the three commands.

const promptMock = vi.fn();
vi.mock("inquirer", () => ({
  default: { prompt: (...args: unknown[]) => promptMock(...args) },
}));

const getServerMock = vi.fn();
vi.mock("../registry.js", () => ({
  getServer: (...args: unknown[]) => getServerMock(...args),
  getBundle: vi.fn(),
  suggestServer: vi.fn(),
}));

let CLIENT: DetectedClient;
vi.mock("../clients/detect.js", () => ({
  detectClients: () => [CLIENT],
  getDetectedClients: () => [CLIENT],
}));

vi.mock("./sync.js", () => ({
  addToRC: vi.fn(),
  readRC: () => null,
}));

vi.mock("./rollback.js", () => ({
  createRollbackSnapshot: () => null,
}));

function fakeChildProcess() {
  return {
    stdout: { on: vi.fn() },
    stdin: { write: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  };
}
const spawnMock = vi.fn((..._args: unknown[]) => fakeChildProcess());
vi.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { install } from "./install.js";
import { run } from "./run.js";
import { uninstall } from "./uninstall.js";
import { listInstalledServers } from "../clients/config.js";

const FAKE_SERVER: RegistryServer = {
  name: "Fetch",
  description: "Fetch a URL",
  command: "npx",
  args: ["-y", "server-fetch"],
  env: {},
  tags: [],
};

describe("end-to-end: install -> run -> uninstall", () => {
  let configPath: string;
  let sigintBefore: Array<(...args: unknown[]) => void>;

  beforeEach(() => {
    configPath = path.join(
      os.tmpdir(),
      `mcpm-e2e-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`
    );
    CLIENT = { id: "cursor", name: "Cursor", configPath, detected: true };

    promptMock.mockReset().mockResolvedValue({ proceed: true, confirmed: true });
    getServerMock.mockReset().mockResolvedValue(FAKE_SERVER);
    spawnMock.mockClear();

    sigintBefore = [...(process.listeners("SIGINT") as Array<(...args: unknown[]) => void>)];
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    const after = process.listeners("SIGINT") as Array<(...args: unknown[]) => void>;
    for (const l of after) {
      if (!sigintBefore.includes(l)) process.removeListener("SIGINT", l);
    }
  });

  it("installs, runs, then uninstalls a server — persisting to and clearing a real config file", async () => {
    // 1. install: writes the real config file on disk
    await install(["fetch"]);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(listInstalledServers(CLIENT).fetch).toEqual({
      command: "npx",
      args: ["-y", "server-fetch"],
    });

    // 2. run: spawns the installed server's command/args without re-prompting (--yes)
    await run("fetch", { yes: true });
    expect(spawnMock).toHaveBeenCalledWith("npx", ["-y", "server-fetch"], expect.any(Object));

    // 3. uninstall: removes it from the real config file
    await uninstall("fetch");
    expect(listInstalledServers(CLIENT).fetch).toBeUndefined();
  });

  it("run reads the exact config that install persisted, not a stale copy", async () => {
    await install(["fetch"]);

    const persisted = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(persisted.mcpServers.fetch).toEqual({ command: "npx", args: ["-y", "server-fetch"] });

    await run("fetch", { yes: true });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("uninstalling a server that was never installed leaves the config file untouched", async () => {
    await install(["fetch"]);
    const before = fs.readFileSync(configPath, "utf-8");

    await uninstall("never-installed");

    expect(fs.readFileSync(configPath, "utf-8")).toBe(before);
  });
});

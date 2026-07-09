import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DetectedClient, McpServerConfig, RegistryServer } from "../types.js";

const promptMock = vi.fn();
vi.mock("inquirer", () => ({
  default: { prompt: (...args: unknown[]) => promptMock(...args) },
}));

const getServerMock = vi.fn();
const getBundleMock = vi.fn();
const suggestServerMock = vi.fn();
vi.mock("../registry.js", () => ({
  getServer: (...args: unknown[]) => getServerMock(...args),
  getBundle: (...args: unknown[]) => getBundleMock(...args),
  suggestServer: (...args: unknown[]) => suggestServerMock(...args),
}));

const detectClientsMock = vi.fn();
vi.mock("../clients/detect.js", () => ({
  detectClients: (...args: unknown[]) => detectClientsMock(...args),
}));

const addServerMock = vi.fn();
const listInstalledServersMock = vi.fn();
vi.mock("../clients/config.js", () => ({
  addServer: (...args: unknown[]) => addServerMock(...args),
  listInstalledServers: (...args: unknown[]) => listInstalledServersMock(...args),
}));

const addToRCMock = vi.fn();
const readRCMock = vi.fn();
vi.mock("./sync.js", () => ({
  addToRC: (...args: unknown[]) => addToRCMock(...args),
  readRC: (...args: unknown[]) => readRCMock(...args),
}));

const createRollbackSnapshotMock = vi.fn();
vi.mock("./rollback.js", () => ({
  createRollbackSnapshot: (...args: unknown[]) => createRollbackSnapshotMock(...args),
}));

import { install } from "./install.js";

const CURSOR: DetectedClient = { id: "cursor", name: "Cursor", configPath: "/fake/cursor.json", detected: true };

const GITHUB_SERVER: RegistryServer = {
  name: "GitHub",
  description: "GitHub MCP server",
  command: "npx",
  args: ["-y", "server-github"],
  env: {},
  tags: [],
};

describe("install — --force reinstall confirmation", () => {
  beforeEach(() => {
    promptMock.mockReset();
    getServerMock.mockReset().mockResolvedValue(GITHUB_SERVER);
    getBundleMock.mockReset();
    suggestServerMock.mockReset();
    detectClientsMock.mockReset().mockReturnValue([CURSOR]);
    addServerMock.mockReset();
    listInstalledServersMock.mockReset().mockReturnValue({});
    addToRCMock.mockReset();
    readRCMock.mockReset().mockReturnValue(null);
    createRollbackSnapshotMock.mockReset().mockReturnValue(null);
  });

  it("installs without prompting when the server isn't installed anywhere yet, even with --force", async () => {
    await install(["github"], { force: true });

    expect(promptMock).not.toHaveBeenCalled();
    expect(addServerMock).toHaveBeenCalledWith(CURSOR, "github", expect.any(Object));
  });

  it("does not reinstall or write anything without --force when already installed", async () => {
    listInstalledServersMock.mockReturnValue({ github: { command: "npx", args: [] } as McpServerConfig });

    await install(["github"], {});

    expect(promptMock).not.toHaveBeenCalled();
    expect(addServerMock).not.toHaveBeenCalled();
  });

  it("asks for confirmation before a forced reinstall of an already-installed server", async () => {
    listInstalledServersMock.mockReturnValue({ github: { command: "npx", args: [] } as McpServerConfig });
    promptMock.mockResolvedValueOnce({ proceed: true });

    await install(["github"], { force: true });

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(addServerMock).toHaveBeenCalledWith(CURSOR, "github", expect.any(Object));
  });

  it("does not write when the user declines the forced-reinstall confirmation", async () => {
    listInstalledServersMock.mockReturnValue({ github: { command: "npx", args: [] } as McpServerConfig });
    promptMock.mockResolvedValueOnce({ proceed: false });

    await install(["github"], { force: true });

    expect(addServerMock).not.toHaveBeenCalled();
  });

  it("skips the confirmation prompt when --yes is passed alongside --force", async () => {
    listInstalledServersMock.mockReturnValue({ github: { command: "npx", args: [] } as McpServerConfig });

    await install(["github"], { force: true, yes: true });

    expect(promptMock).not.toHaveBeenCalled();
    expect(addServerMock).toHaveBeenCalledWith(CURSOR, "github", expect.any(Object));
  });
});

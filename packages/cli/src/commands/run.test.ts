import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const promptMock = vi.fn();
vi.mock("inquirer", () => ({
  default: { prompt: (...args: unknown[]) => promptMock(...args) },
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

vi.mock("../registry.js", () => ({
  getServer: vi.fn().mockResolvedValue(undefined),
}));

import { run } from "./run.js";

// run() registers a real `process.on("SIGINT", ...)` listener whenever it reaches
// the spawn step. We snapshot/restore listeners around each test so they don't
// pile up across the suite.
let sigintListenersBefore: Array<(...args: unknown[]) => void>;

function newSigintListeners(): Array<(...args: unknown[]) => void> {
  return (process.listeners("SIGINT") as Array<(...args: unknown[]) => void>).filter(
    (l) => !sigintListenersBefore.includes(l)
  );
}

function tmpLocalServerDir(pkg: Record<string, unknown>): string {
  const dir = path.join(os.tmpdir(), `mcpm-run-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg), "utf-8");
  return dir;
}

describe("run — confirmation prompt", () => {
  const ORIGINAL_MCPM_YES = process.env.MCPM_YES;
  const createdDirs: string[] = [];

  beforeEach(() => {
    sigintListenersBefore = [...(process.listeners("SIGINT") as Array<(...args: unknown[]) => void>)];
    promptMock.mockReset();
    spawnMock.mockClear();
    delete process.env.MCPM_YES;
  });

  afterEach(() => {
    for (const l of newSigintListeners()) process.removeListener("SIGINT", l);
    if (ORIGINAL_MCPM_YES === undefined) delete process.env.MCPM_YES;
    else process.env.MCPM_YES = ORIGINAL_MCPM_YES;
    for (const dir of createdDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("prints an error and never prompts for an unknown server", async () => {
    await run("this-server-does-not-exist-xyz");
    expect(promptMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("asks for confirmation and does not spawn when the user declines", async () => {
    const dir = tmpLocalServerDir({ name: "local-srv", scripts: { start: "node dist/index.js" } });
    createdDirs.push(dir);
    promptMock.mockResolvedValueOnce({ proceed: false });

    await run(dir);

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("spawns the server once the user confirms", async () => {
    const dir = tmpLocalServerDir({ name: "local-srv", scripts: { start: "node dist/index.js" } });
    createdDirs.push(dir);
    promptMock.mockResolvedValueOnce({ proceed: true });

    await run(dir);

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("skips the confirmation prompt when opts.yes is true", async () => {
    const dir = tmpLocalServerDir({ name: "local-srv", scripts: { start: "node dist/index.js" } });
    createdDirs.push(dir);

    await run(dir, { yes: true });

    expect(promptMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("skips the confirmation prompt when MCPM_YES=1", async () => {
    process.env.MCPM_YES = "1";
    const dir = tmpLocalServerDir({ name: "local-srv", scripts: { start: "node dist/index.js" } });
    createdDirs.push(dir);

    await run(dir);

    expect(promptMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("treats MCPM_YES=0 as falsy and still prompts", async () => {
    process.env.MCPM_YES = "0";
    const dir = tmpLocalServerDir({ name: "local-srv", scripts: { start: "node dist/index.js" } });
    createdDirs.push(dir);
    promptMock.mockResolvedValueOnce({ proceed: true });

    await run(dir);

    expect(promptMock).toHaveBeenCalledTimes(1);
  });
});

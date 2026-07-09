import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { readRC, writeRC, addToRC } from "./sync.js";

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `mcpm-sync-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("readRC", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when no .mcpmrc file exists", () => {
    expect(readRC(dir)).toBeNull();
  });

  it("returns null when the .mcpmrc file contains invalid JSON", () => {
    fs.writeFileSync(path.join(dir, ".mcpmrc"), "{ not valid json", "utf-8");
    expect(readRC(dir)).toBeNull();
  });

  it("parses a valid .mcpmrc file", () => {
    fs.writeFileSync(path.join(dir, ".mcpmrc"), JSON.stringify({ servers: ["github"] }), "utf-8");
    expect(readRC(dir)).toEqual({ servers: ["github"] });
  });
});

describe("writeRC", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes content that readRC can read back", () => {
    writeRC({ servers: ["github", "postgres"] }, dir);
    expect(readRC(dir)).toEqual({ servers: ["github", "postgres"] });
  });

  it("ends the file with a trailing newline", () => {
    writeRC({ servers: [] }, dir);
    const raw = fs.readFileSync(path.join(dir, ".mcpmrc"), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("overwrites an existing .mcpmrc file", () => {
    writeRC({ servers: ["github"] }, dir);
    writeRC({ servers: ["postgres"] }, dir);
    expect(readRC(dir)).toEqual({ servers: ["postgres"] });
  });
});

describe("addToRC", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates a .mcpmrc file with the server when none exists yet", () => {
    addToRC("github", dir);
    expect(readRC(dir)).toEqual({ servers: ["github"] });
  });

  it("appends to the existing servers list", () => {
    writeRC({ servers: ["github"] }, dir);
    addToRC("postgres", dir);
    expect(readRC(dir)).toEqual({ servers: ["github", "postgres"] });
  });

  it("does not add a duplicate entry for an already-listed server", () => {
    writeRC({ servers: ["github"] }, dir);
    addToRC("github", dir);
    expect(readRC(dir)).toEqual({ servers: ["github"] });
  });

  it("preserves the bundles field untouched", () => {
    writeRC({ servers: ["github"], bundles: ["@bundle/webdev"] }, dir);
    addToRC("postgres", dir);
    expect(readRC(dir)).toEqual({ servers: ["github", "postgres"], bundles: ["@bundle/webdev"] });
  });
});

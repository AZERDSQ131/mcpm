import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRollbackSnapshot, rollback } from "./rollback.js";
import type { DetectedClient } from "../types.js";

// createRollbackSnapshot/rollback write to the real ~/.cache/mcp-fleet/rollback
// directory (it's a module-level constant derived from os.homedir()), so we
// track and clean up whatever snapshot dirs these tests create.
const ROLLBACK_DIR = path.join(os.homedir(), ".cache", "mcp-fleet", "rollback");

function snapshotDirsBefore(): Set<string> {
  if (!fs.existsSync(ROLLBACK_DIR)) return new Set();
  return new Set(fs.readdirSync(ROLLBACK_DIR));
}

function newSnapshotDirs(before: Set<string>): string[] {
  if (!fs.existsSync(ROLLBACK_DIR)) return [];
  return fs.readdirSync(ROLLBACK_DIR).filter((name) => !before.has(name));
}

function cleanupSnapshotDirs(names: string[]): void {
  for (const name of names) {
    fs.rmSync(path.join(ROLLBACK_DIR, name), { recursive: true, force: true });
  }
}

function tmpConfigFile(content: string | null): string {
  const p = path.join(os.tmpdir(), `mcpm-rollback-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  if (content !== null) fs.writeFileSync(p, content, "utf-8");
  return p;
}

describe("createRollbackSnapshot", () => {
  let before: Set<string>;
  let createdConfigFiles: string[];

  beforeEach(() => {
    before = snapshotDirsBefore();
    createdConfigFiles = [];
  });

  afterEach(() => {
    cleanupSnapshotDirs(newSnapshotDirs(before));
    for (const f of createdConfigFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it("returns null when no clients are detected", () => {
    const clients: DetectedClient[] = [{ id: "cursor", name: "Cursor", configPath: "/nowhere", detected: false }];
    const result = createRollbackSnapshot(clients, "test");
    expect(result).toBeNull();
  });

  it("creates a snapshot directory for detected clients", () => {
    const configPath = tmpConfigFile(JSON.stringify({ mcpServers: { github: {} } }));
    createdConfigFiles.push(configPath);

    const clients: DetectedClient[] = [{ id: "cursor", name: "Cursor", configPath, detected: true }];
    const snapshotDir = createRollbackSnapshot(clients, "install");

    expect(snapshotDir).not.toBeNull();
    expect(fs.existsSync(snapshotDir!)).toBe(true);
    expect(fs.existsSync(path.join(snapshotDir!, "manifest.json"))).toBe(true);
  });

  it("copies the existing config file into the snapshot", () => {
    const content = JSON.stringify({ mcpServers: { github: { command: "npx" } } });
    const configPath = tmpConfigFile(content);
    createdConfigFiles.push(configPath);

    const clients: DetectedClient[] = [{ id: "cursor", name: "Cursor", configPath, detected: true }];
    const snapshotDir = createRollbackSnapshot(clients, "install")!;

    const copied = fs.readFileSync(path.join(snapshotDir, "cursor.json"), "utf-8");
    expect(copied).toBe(content);
  });

  it("records existed: false for a client with no config file yet", () => {
    const configPath = tmpConfigFile(null); // never actually written
    const clients: DetectedClient[] = [{ id: "cursor", name: "Cursor", configPath, detected: true }];
    const snapshotDir = createRollbackSnapshot(clients, "install")!;

    const manifest = JSON.parse(fs.readFileSync(path.join(snapshotDir, "manifest.json"), "utf-8"));
    expect(manifest.files[0].existed).toBe(false);
    expect(manifest.files[0].hash).toBeNull();
  });

  it("records a sha256 hash for a client with an existing config file", () => {
    const configPath = tmpConfigFile("{}");
    createdConfigFiles.push(configPath);
    const clients: DetectedClient[] = [{ id: "cursor", name: "Cursor", configPath, detected: true }];
    const snapshotDir = createRollbackSnapshot(clients, "install")!;

    const manifest = JSON.parse(fs.readFileSync(path.join(snapshotDir, "manifest.json"), "utf-8"));
    expect(manifest.files[0].hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("only snapshots clients marked as detected", () => {
    const detectedPath = tmpConfigFile("{}");
    createdConfigFiles.push(detectedPath);
    const clients: DetectedClient[] = [
      { id: "cursor", name: "Cursor", configPath: detectedPath, detected: true },
      { id: "zed", name: "Zed", configPath: "/not/detected", detected: false },
    ];
    const snapshotDir = createRollbackSnapshot(clients, "install")!;
    const manifest = JSON.parse(fs.readFileSync(path.join(snapshotDir, "manifest.json"), "utf-8"));
    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0].client_id).toBe("cursor");
  });

  it("stores the given reason in the manifest", () => {
    const configPath = tmpConfigFile("{}");
    createdConfigFiles.push(configPath);
    const clients: DetectedClient[] = [{ id: "cursor", name: "Cursor", configPath, detected: true }];
    const snapshotDir = createRollbackSnapshot(clients, "manual-test-reason")!;
    const manifest = JSON.parse(fs.readFileSync(path.join(snapshotDir, "manifest.json"), "utf-8"));
    expect(manifest.reason).toBe("manual-test-reason");
  });
});

describe("rollback", () => {
  let before: Set<string>;
  let createdConfigFiles: string[];

  beforeEach(() => {
    before = snapshotDirsBefore();
    createdConfigFiles = [];
  });

  afterEach(() => {
    cleanupSnapshotDirs(newSnapshotDirs(before));
    for (const f of createdConfigFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it("restores a config file to its snapshotted content", async () => {
    const originalContent = JSON.stringify({ mcpServers: { github: {} } });
    const configPath = tmpConfigFile(originalContent);
    createdConfigFiles.push(configPath);

    const clients: DetectedClient[] = [{ id: "cursor", name: "Cursor", configPath, detected: true }];
    const snapshotDir = createRollbackSnapshot(clients, "install")!;

    // Simulate a change made after the snapshot was taken.
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { github: {}, postgres: {} } }), "utf-8");

    await rollback({ snapshot: snapshotDir });

    const restored = fs.readFileSync(configPath, "utf-8");
    expect(restored).toBe(originalContent);
  });

  it("removes a config file that didn't exist at snapshot time", async () => {
    const configPath = tmpConfigFile(null);
    const clients: DetectedClient[] = [{ id: "cursor", name: "Cursor", configPath, detected: true }];
    const snapshotDir = createRollbackSnapshot(clients, "install")!;

    // The file got created after the snapshot (e.g. a fresh install).
    fs.writeFileSync(configPath, "{}", "utf-8");
    expect(fs.existsSync(configPath)).toBe(true);

    await rollback({ snapshot: snapshotDir });

    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("does nothing and warns when the snapshot directory has no manifest", async () => {
    const fakeDir = path.join(os.tmpdir(), `mcpm-fake-snapshot-${Date.now()}`);
    fs.mkdirSync(fakeDir, { recursive: true });
    await expect(rollback({ snapshot: fakeDir })).resolves.not.toThrow();
    fs.rmSync(fakeDir, { recursive: true, force: true });
  });
});

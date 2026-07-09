import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { detectClients, getDetectedClients } from "./detect.js";

function mockExistsSync(impl: (path: unknown) => boolean): void {
  vi.spyOn(fs, "existsSync").mockImplementation(impl as (path: fs.PathLike) => boolean);
}

describe("detectClients", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks every known client as not detected when nothing exists on disk", () => {
    mockExistsSync(() => false);
    const clients = detectClients();
    expect(clients.length).toBeGreaterThan(0);
    expect(clients.every((c) => c.detected === false)).toBe(true);
  });

  it("marks a client as detected when its config file exists", () => {
    mockExistsSync((p) => String(p).endsWith("mcp.json") && String(p).includes(".cursor"));
    const clients = detectClients();
    const cursor = clients.find((c) => c.id === "cursor");
    expect(cursor?.detected).toBe(true);
  });

  it("marks a client as detected when only its config directory exists", () => {
    mockExistsSync((p) => {
      const str = String(p);
      if (str.endsWith("mcp.json")) return false; // the file itself is absent
      return str.includes(".cursor"); // but the parent directory is present
    });
    const clients = detectClients();
    const cursor = clients.find((c) => c.id === "cursor");
    expect(cursor?.detected).toBe(true);
  });

  it("returns one entry per known client id, with no duplicates", () => {
    mockExistsSync(() => false);
    const clients = detectClients();
    const ids = clients.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the expected set of supported client ids", () => {
    mockExistsSync(() => false);
    const ids = detectClients().map((c) => c.id);
    for (const expected of ["claude", "cursor", "vscode", "codex", "windsurf", "zed", "gemini", "cline", "continue"]) {
      expect(ids).toContain(expected);
    }
  });
});

describe("getDetectedClients", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty array when nothing is detected", () => {
    mockExistsSync(() => false);
    expect(getDetectedClients()).toEqual([]);
  });

  it("filters out clients that are not detected", () => {
    mockExistsSync((p) => String(p).includes(".cursor"));
    const detected = getDetectedClients();
    expect(detected.length).toBeGreaterThan(0);
    expect(detected.every((c) => c.detected)).toBe(true);
    expect(detected.some((c) => c.id === "cursor")).toBe(true);
  });
});

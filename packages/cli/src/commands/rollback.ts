import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import chalk from "chalk";
import { detectClients } from "../clients/detect.js";
import type { DetectedClient } from "../types.js";

const ROLLBACK_DIR = path.join(os.homedir(), ".cache", "mcp-fleet", "rollback");

interface SnapshotFile {
  client_id: string;
  client_name: string;
  config_path: string;
  snapshot_file: string;
  existed: boolean;
  hash: string | null;
}

interface RollbackManifest {
  snapshot_version: "mcpm.rollback.v1";
  created_at: string;
  reason: string;
  files: SnapshotFile[];
}

export function createRollbackSnapshot(clients: DetectedClient[], reason: string): string | null {
  const detected = clients.filter((client) => client.detected);
  if (detected.length === 0) return null;

  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = path.join(ROLLBACK_DIR, id);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const files: SnapshotFile[] = detected.map((client) => {
    const existed = fs.existsSync(client.configPath);
    const snapshotFile = `${client.id}.json`;
    const snapshotPath = path.join(snapshotDir, snapshotFile);
    if (existed) {
      fs.copyFileSync(client.configPath, snapshotPath);
    }
    return {
      client_id: client.id,
      client_name: client.name,
      config_path: client.configPath,
      snapshot_file: snapshotFile,
      existed,
      hash: existed ? hashFile(client.configPath) : null,
    };
  });

  const manifest: RollbackManifest = {
    snapshot_version: "mcpm.rollback.v1",
    created_at: new Date().toISOString(),
    reason,
    files,
  };
  fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  return snapshotDir;
}

export async function rollback(opts: { snapshot?: string; list?: boolean } = {}): Promise<void> {
  if (opts.list) {
    listSnapshots();
    return;
  }

  const snapshotDir = opts.snapshot ? path.resolve(opts.snapshot) : latestSnapshotDir();
  if (!snapshotDir) {
    console.log(chalk.yellow("\nNo rollback snapshots found.\n"));
    return;
  }

  const manifestPath = path.join(snapshotDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.log(chalk.red(`\nInvalid rollback snapshot: ${snapshotDir}\n`));
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as RollbackManifest;
  let restored = 0;
  let removed = 0;

  for (const file of manifest.files) {
    if (file.existed) {
      const snapshotPath = path.join(snapshotDir, file.snapshot_file);
      fs.mkdirSync(path.dirname(file.config_path), { recursive: true });
      fs.copyFileSync(snapshotPath, file.config_path);
      restored++;
      console.log(`${chalk.green("✓")} restored ${chalk.bold(file.client_name)} ${chalk.dim(displayPath(file.config_path))}`);
    } else if (fs.existsSync(file.config_path)) {
      fs.rmSync(file.config_path);
      removed++;
      console.log(`${chalk.green("✓")} removed ${chalk.bold(file.client_name)} config created after snapshot ${chalk.dim(displayPath(file.config_path))}`);
    }
  }

  console.log(chalk.green(`\n✓ Rollback applied from ${chalk.bold(snapshotDir)}`));
  console.log(chalk.dim(`  restored ${restored}, removed ${removed}\n`));
}

function latestSnapshotDir(): string | null {
  if (!fs.existsSync(ROLLBACK_DIR)) return null;
  const entries = fs.readdirSync(ROLLBACK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const latest = entries.at(-1);
  return latest ? path.join(ROLLBACK_DIR, latest) : null;
}

function listSnapshots(): void {
  if (!fs.existsSync(ROLLBACK_DIR)) {
    console.log(chalk.yellow("\nNo rollback snapshots found.\n"));
    return;
  }

  const names = fs
    .readdirSync(ROLLBACK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (names.length === 0) {
    console.log(chalk.yellow("\nNo rollback snapshots found.\n"));
    return;
  }

  console.log(chalk.dim(`\n${names.length} snapshot${names.length > 1 ? "s" : ""} (most recent first):\n`));

  for (const name of names) {
    const manifestPath = path.join(ROLLBACK_DIR, name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as RollbackManifest;
    const date = new Date(manifest.created_at).toLocaleString();
    console.log(`  ${chalk.bold(name)}`);
    console.log(chalk.dim(`    ${date} — ${manifest.reason} — ${manifest.files.length} client${manifest.files.length > 1 ? "s" : ""}`));
  }

  console.log();
  console.log(chalk.dim("Restore: ") + chalk.italic("mcpm rollback --snapshot <name>"));
  console.log();
}

function displayPath(filePath: string): string {
  const home = os.homedir();
  return filePath.startsWith(home) ? filePath.replace(home, "~") : filePath;
}

function hashFile(filePath: string): string {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

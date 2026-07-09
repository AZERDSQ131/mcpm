import fs from "fs";
import path from "path";
import crypto from "crypto";
import chalk from "chalk";
import inquirer from "inquirer";
import { install } from "./install.js";
import { createRollbackSnapshot } from "./rollback.js";
import { getBundle, getServer } from "../registry.js";
import { detectClients } from "../clients/detect.js";
import { readConfig, renderConfigContent } from "../clients/config.js";
import type { ClientConfig, DetectedClient, McpServerConfig } from "../types.js";

interface McpmRC {
  servers?: string[];
  bundles?: string[];
}

const RC_FILE = ".mcpmrc";

interface SyncOptions {
  dryRun?: boolean;
  receipt?: string;
}

interface TargetReceipt {
  client_id: string;
  client_name: string;
  config_path: string;
  detected: boolean;
  before_hash: string | null;
  proposed_hash: string | null;
  added_servers: string[];
  removed_servers: string[];
  changed_servers: string[];
  unchanged_servers: string[];
  missing_env: Array<{ server_id: string; keys: string[] }>;
  /**
   * Hash of the client's config as it stands right now — i.e. the baseline that
   * `mcpm sync` would snapshot for rollback if this dry run were applied for real.
   * Previously misleadingly named `rollback_snapshot`, which implied an actual
   * snapshot directory/id rather than a content hash (issue #51).
   */
  rollback_baseline_hash: string | null;
}

interface SyncReceipt {
  receipt_version: "mcpm.sync-rendered-output.v1";
  generated_at: string;
  command: string;
  rc_path: string;
  rc_hash: string;
  desired_servers: string[];
  unknown_servers: string[];
  targets: TargetReceipt[];
}

export function readRC(dir = process.cwd()): McpmRC | null {
  const rcPath = path.join(dir, RC_FILE);
  if (!fs.existsSync(rcPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(rcPath, "utf-8")) as McpmRC;
  } catch {
    return null;
  }
}

export function writeRC(data: McpmRC, dir = process.cwd()): void {
  const rcPath = path.join(dir, RC_FILE);
  fs.writeFileSync(rcPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function addToRC(serverId: string, dir = process.cwd()): void {
  const existing = readRC(dir) ?? {};
  const servers = existing.servers ?? [];
  if (!servers.includes(serverId)) {
    existing.servers = [...servers, serverId];
    writeRC(existing, dir);
  }
}

export async function sync(opts: SyncOptions = {}): Promise<void> {
  const rc = readRC();

  if (!rc) {
    console.log(chalk.yellow(`\nNo ${RC_FILE} found in current directory.`));
    const { create } = await inquirer.prompt<{ create: boolean }>([
      {
        type: "confirm",
        name: "create",
        message: "Create one?",
        default: true,
      },
    ]);
    if (create) {
      writeRC({ servers: [] });
      console.log(chalk.green(`\n✓ Created ${RC_FILE} — add servers and run mcpm sync again.\n`));
    }
    return;
  }

  const servers = [...(rc.servers ?? [])];

  // Expand bundles
  for (const bundleRef of rc.bundles ?? []) {
    const bundleName = bundleRef.replace("@bundle/", "");
    const bundle = await getBundle(bundleName);
    if (bundle) servers.push(...bundle.servers);
    else console.log(chalk.yellow(`~ Unknown bundle: ${bundleRef}`));
  }

  const unique = [...new Set(servers)];

  if (unique.length === 0) {
    console.log(chalk.dim(`\n${RC_FILE} has no servers. Add some with mcpm install --save <server>\n`));
    return;
  }

  if (opts.dryRun || opts.receipt) {
    await dryRunSync(unique, opts.receipt);
    return;
  }

  console.log(chalk.dim(`\nSyncing ${unique.length} servers from ${RC_FILE}...\n`));
  const snapshot = createRollbackSnapshot(detectClients(), "sync");
  if (snapshot) console.log(chalk.dim(`Rollback snapshot: ${snapshot}\n`));
  await install(unique, { snapshot: false });
}

async function dryRunSync(serverIds: string[], receiptPath?: string): Promise<void> {
  const desired: Record<string, McpServerConfig> = {};
  const requiredEnv: Record<string, string[]> = {};
  const unknownServers: string[] = [];

  for (const serverId of serverIds) {
    const server = await getServer(serverId);
    if (!server) {
      unknownServers.push(serverId);
      continue;
    }
    desired[serverId] = {
      command: server.command,
      args: server.args,
    };
    const envKeys = Object.entries(server.env ?? {})
      .filter(([, meta]) => meta.required)
      .map(([key]) => key);
    if (envKeys.length > 0) requiredEnv[serverId] = envKeys;
  }

  const clients = detectClients();
  const targets = clients.map((client) => buildTargetReceipt(client, desired, requiredEnv));
  const rcPath = path.join(process.cwd(), RC_FILE);
  const receipt: SyncReceipt = {
    receipt_version: "mcpm.sync-rendered-output.v1",
    generated_at: new Date().toISOString(),
    command: receiptPath ? "mcpm sync --dry-run --receipt" : "mcpm sync --dry-run",
    rc_path: rcPath,
    rc_hash: hashFile(rcPath) ?? "",
    desired_servers: Object.keys(desired).sort(),
    unknown_servers: unknownServers.sort(),
    targets,
  };

  console.log(chalk.dim(`\nDry run: ${receipt.desired_servers.length} known server${receipt.desired_servers.length === 1 ? "" : "s"} from ${RC_FILE}\n`));
  for (const target of targets.filter((t) => t.detected)) {
    const changed = target.added_servers.length + target.removed_servers.length + target.changed_servers.length;
    const symbol = changed > 0 ? chalk.yellow("~") : chalk.green("✓");
    console.log(`${symbol} ${chalk.bold(target.client_name)} ${chalk.dim(target.config_path)}`);
    if (target.added_servers.length > 0) console.log(chalk.dim(`  added: ${target.added_servers.join(", ")}`));
    if (target.changed_servers.length > 0) console.log(chalk.dim(`  changed: ${target.changed_servers.join(", ")}`));
    if (target.missing_env.length > 0) {
      const envText = target.missing_env.map((item) => `${item.server_id} (${item.keys.join(", ")})`).join("; ");
      console.log(chalk.yellow(`  missing env values: ${envText}`));
    }
  }

  if (unknownServers.length > 0) {
    console.log(chalk.yellow(`\nUnknown servers skipped: ${unknownServers.join(", ")}`));
  }

  if (receiptPath) {
    const resolved = path.resolve(receiptPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(receipt, null, 2) + "\n", "utf-8");
    console.log(chalk.green(`\n✓ Wrote dry-run receipt to ${chalk.bold(resolved)}\n`));
  } else {
    console.log(chalk.dim("\nRun with --receipt <file> to persist the rendered-output receipt.\n"));
  }
}

function buildTargetReceipt(
  client: DetectedClient,
  desired: Record<string, McpServerConfig>,
  requiredEnv: Record<string, string[]>
): TargetReceipt {
  if (!client.detected) {
    return {
      client_id: client.id,
      client_name: client.name,
      config_path: client.configPath,
      detected: false,
      before_hash: null,
      proposed_hash: null,
      added_servers: [],
      removed_servers: [],
      changed_servers: [],
      unchanged_servers: [],
      missing_env: [],
      rollback_baseline_hash: null,
    };
  }

  const current = readConfig(client);
  const proposed: ClientConfig = { mcpServers: { ...current.mcpServers } };
  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  for (const [serverId, config] of Object.entries(desired)) {
    const existing = current.mcpServers[serverId];
    if (!existing) added.push(serverId);
    else if (stableStringify(comparableConfig(existing)) !== stableStringify(comparableConfig(config))) changed.push(serverId);
    else unchanged.push(serverId);
    proposed.mcpServers[serverId] = config;
  }

  const rendered = renderConfigContent(client, proposed);
  const missingEnv = Object.entries(requiredEnv)
    .map(([server_id, keys]) => ({
      server_id,
      keys: keys.filter((key) => !current.mcpServers[server_id]?.env?.[key]),
    }))
    .filter((item) => item.keys.length > 0);

  return {
    client_id: client.id,
    client_name: client.name,
    config_path: client.configPath,
    detected: true,
    before_hash: hashFile(client.configPath),
    proposed_hash: sha256(rendered),
    added_servers: added.sort(),
    removed_servers: [],
    changed_servers: changed.sort(),
    unchanged_servers: unchanged.sort(),
    missing_env: missingEnv,
    rollback_baseline_hash: hashFile(client.configPath),
  };
}

function comparableConfig(config: McpServerConfig): Pick<McpServerConfig, "command" | "args"> {
  return {
    command: config.command,
    args: config.args ?? [],
  };
}

function hashFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return sha256(fs.readFileSync(filePath));
}

function sha256(data: string | Buffer): string {
  return `sha256:${crypto.createHash("sha256").update(data).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForHash(value));
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, sortForHash(val)])
  );
}

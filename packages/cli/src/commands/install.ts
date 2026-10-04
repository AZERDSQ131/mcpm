import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { getServer, getBundle, suggestServer } from "../registry.js";
import { detectClients } from "../clients/detect.js";
import { addServer, listInstalledServers } from "../clients/config.js";
import { addToRC, readRC } from "./sync.js";
import { createRollbackSnapshot } from "./rollback.js";
import { isDryRun } from "../dryRun.js";
import { isSecretEnvVar } from "../secrets.js";
import type { McpServerConfig } from "../types.js";

function stripSurroundingQuotes(value: string): string {
  if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export async function install(
  serverIds: string[],
  opts: { save?: boolean; snapshot?: boolean; force?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  const allClients = detectClients();
  const detectedClients = allClients.filter((c) => c.detected);

  if (detectedClients.length === 0) {
    console.log(chalk.yellow("\nNo AI client detected on this machine."));
    console.log(
      chalk.dim("Supported: Claude Code, Cursor, VS Code, Windsurf, Zed, Gemini CLI, Cline, Continue\n")
    );
    return;
  }

  console.log(chalk.dim("\nDetected clients:"));
  for (const client of detectedClients) {
    console.log(chalk.green("  ✓ ") + chalk.bold(client.name));
  }
  console.log();

  const dry = opts.dryRun ?? isDryRun();

  if (opts.snapshot !== false && !dry) {
    const snapshot = createRollbackSnapshot(detectedClients, "install");
    if (snapshot) console.log(chalk.dim(`Rollback snapshot: ${snapshot}\n`));
  }

  // Expand bundles
  const expanded: string[] = [];
  for (const id of serverIds) {
    if (id.startsWith("@bundle/")) {
      const bundleName = id.replace("@bundle/", "");
      const bundle = await getBundle(bundleName);
      if (!bundle) {
        console.log(chalk.red(`✗ Unknown bundle: ${chalk.bold(id)}`));
        console.log(chalk.dim(`  Run ${chalk.italic("mcpm search --bundles")} to see available bundles`));
        continue;
      }
      console.log(
        chalk.bold(`Bundle ${chalk.cyan(bundle.name)}: `) +
          chalk.dim(bundle.servers.join(", "))
      );
      console.log();
      expanded.push(...bundle.servers);
    } else {
      expanded.push(id);
    }
  }

  const shouldSave = opts.save || readRC() !== null;

  if (dry) {
    console.log(chalk.dim(`\nDry run: previewing install of ${expanded.length} requested ${expanded.length > 1 ? "entries" : "entry"} (no changes will be written)...\n`));
    for (const ref of [...new Set(expanded)]) {
      const { id: serverId, version } = parseServerRef(ref);
      const server = await getServer(serverId);
      if (!server) {
        const suggestion = await suggestServer(serverId);
        console.log(
          chalk.red(`✗ Unknown server: ${chalk.bold(serverId)}`),
          suggestion
            ? chalk.dim(`— did you mean ${chalk.bold(suggestion)}?`)
            : chalk.dim(`— run ${chalk.italic("mcpm search")} to browse available servers`)
        );
        continue;
      }
      console.log(chalk.bold(`${server.name} (${serverId}):`));
      if (version !== "latest") {
        console.log(chalk.dim(`  pinned version ${version} recorded (registry installs latest)`));
      }
      for (const client of detectedClients) {
        const alreadyInstalled = !!listInstalledServers(client)[serverId];
        if (alreadyInstalled && !opts.force) {
          console.log(chalk.dim(`  = ${client.name} already installed — skipped (use --force to reconfigure)`));
        } else if (alreadyInstalled && opts.force) {
          console.log(chalk.yellow(`  ~ ${client.name} would reconfigure ${serverId} ${chalk.dim(client.configPath)}`));
        } else {
          console.log(chalk.green(`  + ${client.name} would install ${serverId} ${chalk.dim(client.configPath)}`));
        }
      }
    }
    console.log(chalk.dim("\nDry run: no client configs written, no rollback snapshot created.\n"));
    return;
  }

  const seenIds = new Set<string>();
  const deduped = [...new Set(expanded)].filter((ref) => {
    const id = ref.split("@").length > 1 && !ref.startsWith("@bundle/") ? ref.slice(0, ref.lastIndexOf("@")) : ref;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  for (const ref of deduped) {
    const { id, version } = parseServerRef(ref);
    await installOne(ref, detectedClients, { force: opts.force });
    if (shouldSave && !dry) addToRC(id, version);
  }

  if (shouldSave && opts.save && !dry) {
    console.log(chalk.dim(`✓ Saved to .mcpmrc\n`));
  } else if (dry && shouldSave) {
    console.log(chalk.dim(`[dry-run] .mcpmrc left untouched\n`));
  }
}

function parseServerRef(ref: string): { id: string; version: string } {
  const at = ref.lastIndexOf("@");
  if (at > 0) {
    const id = ref.slice(0, at);
    const version = ref.slice(at + 1).trim();
    if (id && version) return { id, version };
  }
  return { id: ref, version: "latest" };
}

async function installOne(
  serverRef: string,
  clients: ReturnType<typeof detectClients>,
  opts: { force?: boolean } = {}
): Promise<void> {
  const { id: serverId, version } = parseServerRef(serverRef);
  const server = await getServer(serverId);

  if (!server) {
    const suggestion = await suggestServer(serverId);
    console.log(
      chalk.red(`✗ Unknown server: ${chalk.bold(serverId)}`),
      suggestion
        ? chalk.dim(`— did you mean ${chalk.bold(suggestion)}?`)
        : chalk.dim(`— run ${chalk.italic("mcpm search")} to browse available servers`)
    );
    return;
  }

  if (version !== "latest") {
    console.log(
      chalk.yellow(`  Note: ${serverId}@${version} pinned in .mcpmrc — registry has no versioned artifacts, installing latest and recording the pin.`)
    );
  }

  // Split clients into those that need (re)configuring vs. those to leave untouched
  const alreadyInstalledClients = clients.filter(
    (client) => !!listInstalledServers(client)[serverId]
  );
  const targetClients = opts.force
    ? clients
    : clients.filter((client) => !listInstalledServers(client)[serverId]);

  if (targetClients.length === 0) {
    console.log(chalk.yellow(`\n~ ${server.name} already installed in all clients`));
    console.log(chalk.dim(`  Run ${chalk.italic(`mcpm install ${serverId} --force`)} to reconfigure it`));
    console.log();
    return;
  }

  const isReinstall = opts.force && alreadyInstalledClients.length > 0;
  console.log(chalk.bold(`${isReinstall ? "Reinstalling" : "Installing"} ${server.name}...`));
  if (isReinstall) {
    console.log(
      chalk.dim(`  --force: reconfiguring ${alreadyInstalledClients.length} already-installed client${alreadyInstalledClients.length > 1 ? "s" : ""}`)
    );
  }

  const envValues: Record<string, string> = {};
  const envKeys = Object.entries(server.env ?? {});

  if (envKeys.length > 0) {
    console.log(chalk.dim("  This server requires environment variables:"));
    for (const [key, meta] of envKeys) {
      if (meta.required) {
        const isSecret = isSecretEnvVar(meta);
        const { value } = await inquirer.prompt<{ value: string }>([
          {
            type: isSecret ? "password" : "input",
            name: "value",
            message: `  ${key} — ${chalk.dim(meta.description)}:`,
            ...(isSecret && { mask: "*" }),
            validate: (input: string) =>
              input.trim().length > 0 || `${key} is required`,
          },
        ]);
        envValues[key] = stripSurroundingQuotes(value.trim());
      }
    }
    console.log();
  }

  const serverConfig: McpServerConfig = {
    command: server.command,
    args: server.args,
    ...(Object.keys(envValues).length > 0 && { env: envValues }),
  };

  const spinner = ora("Writing configuration...").start();

  for (const client of targetClients) {
    addServer(client, serverId, serverConfig);
  }

  spinner.stop();

  for (const client of targetClients) {
    console.log(
      `  ${chalk.green("✓")} ${chalk.bold(client.name)} ${chalk.dim(client.configPath)}`
    );
  }

  console.log(
    chalk.green(`\n✓ ${server.name} ${isReinstall ? "reinstalled" : "installed"}`) +
      chalk.dim(` for ${targetClients.length} client${targetClients.length > 1 ? "s" : ""}`)
  );
  if (envKeys.length > 0) console.log(chalk.dim("  Restart your AI client for changes to take effect."));
  console.log();
}

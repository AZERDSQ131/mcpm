import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { getServer, getBundle } from "../registry.js";
import { detectClients } from "../clients/detect.js";
import { addServer, listInstalledServers } from "../clients/config.js";
import { addToRC, readRC } from "./sync.js";
import type { McpServerConfig } from "../types.js";

export async function install(serverIds: string[], opts: { save?: boolean } = {}): Promise<void> {
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

  for (const serverId of [...new Set(expanded)]) {
    await installOne(serverId, detectedClients);
    if (shouldSave) addToRC(serverId);
  }

  if (shouldSave && opts.save) {
    console.log(chalk.dim(`✓ Saved to .mcpmrc\n`));
  }
}

async function installOne(
  serverId: string,
  clients: ReturnType<typeof detectClients>
): Promise<void> {
  const server = await getServer(serverId);

  if (!server) {
    console.log(
      chalk.red(`✗ Unknown server: ${chalk.bold(serverId)}`),
      chalk.dim(`— run ${chalk.italic("mcpm search")} to browse available servers`)
    );
    return;
  }

  console.log(chalk.bold(`Installing ${server.name}...`));

  const envValues: Record<string, string> = {};
  const envKeys = Object.entries(server.env ?? {});

  if (envKeys.length > 0) {
    console.log(chalk.dim("  This server requires environment variables:"));
    for (const [key, meta] of envKeys) {
      if (meta.required) {
        const { value } = await inquirer.prompt<{ value: string }>([
          {
            type: "password",
            name: "value",
            message: `  ${key} — ${chalk.dim(meta.description)}:`,
            mask: "*",
            validate: (input: string) =>
              input.trim().length > 0 || `${key} is required`,
          },
        ]);
        envValues[key] = value.trim();
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
  let successCount = 0;

  for (const client of clients) {
    const existing = listInstalledServers(client);
    if (existing[serverId]) continue;
    addServer(client, serverId, serverConfig);
    successCount++;
  }

  spinner.stop();

  for (const client of clients) {
    const existing = listInstalledServers(client);
    if (existing[serverId]) {
      console.log(
        `  ${chalk.green("✓")} ${chalk.bold(client.name)} ${chalk.dim(client.configPath)}`
      );
    }
  }

  if (successCount > 0) {
    console.log(chalk.green(`\n✓ ${server.name} installed`) + chalk.dim(` for ${successCount} client${successCount > 1 ? "s" : ""}`));
    if (envKeys.length > 0) console.log(chalk.dim("  Restart your AI client for changes to take effect."));
  } else {
    console.log(chalk.yellow(`\n~ ${server.name} already installed in all clients`));
  }
  console.log();
}

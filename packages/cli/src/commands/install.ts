import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { getServer } from "../registry.js";
import { getDetectedClients, detectClients } from "../clients/detect.js";
import { addServer, listInstalledServers } from "../clients/config.js";
import type { McpServerConfig } from "../types.js";

export async function install(serverIds: string[]): Promise<void> {
  const allClients = detectClients();
  const detectedClients = allClients.filter((c) => c.detected);

  if (detectedClients.length === 0) {
    console.log(chalk.yellow("\nNo AI client detected on this machine."));
    console.log(
      chalk.dim("Supported: Claude Code, Cursor, VS Code Copilot, Windsurf, Codex\n")
    );
    return;
  }

  console.log(chalk.dim("\nDetected clients:"));
  for (const client of detectedClients) {
    console.log(chalk.green("  ✓ ") + chalk.bold(client.name));
  }
  console.log();

  for (const serverId of serverIds) {
    await installOne(serverId, detectedClients);
  }
}

async function installOne(
  serverId: string,
  clients: ReturnType<typeof getDetectedClients>
): Promise<void> {
  const server = getServer(serverId);

  if (!server) {
    console.log(
      chalk.red(`✗ Unknown server: ${chalk.bold(serverId)}`),
      chalk.dim(`— run ${chalk.italic("mcpm search")} to browse available servers`)
    );
    return;
  }

  console.log(chalk.bold(`Installing ${server.name}...`));

  const envValues: Record<string, string> = {};
  const envKeys = Object.entries(server.env);

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
  let skipCount = 0;

  for (const client of clients) {
    const existing = listInstalledServers(client);
    if (existing[serverId]) {
      skipCount++;
      continue;
    }
    addServer(client, serverId, serverConfig);
    successCount++;
  }

  spinner.stop();

  for (const client of clients) {
    const existing = listInstalledServers(client);
    if (existing[serverId]) {
      const wasSkipped = successCount === 0 && skipCount > 0;
      const icon = wasSkipped ? chalk.yellow("~") : chalk.green("✓");
      const status = wasSkipped ? chalk.dim("already installed") : chalk.dim(client.configPath);
      console.log(`  ${icon} ${chalk.bold(client.name)} ${status}`);
    }
  }

  if (successCount > 0) {
    console.log(
      chalk.green(`\n✓ ${server.name} installed`) +
        chalk.dim(` for ${successCount} client${successCount > 1 ? "s" : ""}`)
    );
    if (envKeys.length > 0) {
      console.log(
        chalk.dim(`  Restart your AI client for changes to take effect.`)
      );
    }
  } else {
    console.log(chalk.yellow(`\n~ ${server.name} already installed in all clients`));
  }
  console.log();
}

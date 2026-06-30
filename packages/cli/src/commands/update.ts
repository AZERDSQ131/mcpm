import chalk from "chalk";
import { execSync } from "child_process";
import ora from "ora";
import { getDetectedClients } from "../clients/detect.js";
import { listInstalledServers } from "../clients/config.js";
import { getServer } from "../registry.js";

export async function update(): Promise<void> {
  const clients = getDetectedClients();

  if (clients.length === 0) {
    console.log(chalk.yellow("\nNo AI client detected.\n"));
    return;
  }

  const installed = new Set<string>();
  for (const client of clients) {
    const servers = listInstalledServers(client);
    for (const id of Object.keys(servers)) {
      installed.add(id);
    }
  }

  if (installed.size === 0) {
    console.log(chalk.dim("\nNo servers installed to update.\n"));
    return;
  }

  console.log(
    chalk.dim(`\nUpdating ${installed.size} server${installed.size > 1 ? "s" : ""}...\n`)
  );

  for (const serverId of installed) {
    const server = getServer(serverId);
    if (!server || server.command !== "npx") continue;

    const pkg = server.args.find((a) => a.startsWith("@") || (!a.startsWith("-") && a !== "-y"));
    if (!pkg) continue;

    const spinner = ora(`Updating ${chalk.bold(serverId)}...`).start();
    try {
      execSync(`npm install -g ${pkg}@latest`, {
        stdio: "pipe",
        timeout: 60_000,
      });
      spinner.succeed(
        chalk.green(`✓ `) + chalk.bold(serverId) + chalk.dim(` updated`)
      );
    } catch {
      spinner.warn(
        chalk.yellow(`~ `) +
          chalk.bold(serverId) +
          chalk.dim(` — could not update (package may be npx-only)`)
      );
    }
  }

  console.log(chalk.green("\n✓ Update complete\n"));
}

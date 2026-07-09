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
    const server = await getServer(serverId);
    if (!server) continue;

    const { command, args } = server;
    const spinner = ora(`Updating ${chalk.bold(serverId)}...`).start();

    try {
      if (command === "npx") {
        const pkg = args.find((a: string) => !a.startsWith("-") && a !== "-y");
        if (!pkg) { spinner.stop(); continue; }
        execSync(`npm install -g ${pkg}@latest`, { stdio: "pipe", timeout: 60_000 });
      } else if (command === "uvx") {
        const pkg = args.find((a: string) => !a.startsWith("-") && a !== "--from");
        if (!pkg) { spinner.stop(); continue; }
        execSync(`uv tool upgrade ${pkg}`, { stdio: "pipe", timeout: 60_000 });
      } else if (command === "docker") {
        const image = args.find((a: string) => !a.startsWith("-") && !["run", "-i", "--rm"].includes(a));
        if (!image) { spinner.stop(); continue; }
        execSync(`docker pull ${image}`, { stdio: "pipe", timeout: 120_000 });
      } else if (command === "go") {
        const mod = args.find((a: string) => !a.startsWith("-") && a !== "run");
        if (!mod) { spinner.stop(); continue; }
        execSync(`go install ${mod.replace(/@[^@]+$/, "")}@latest`, { stdio: "pipe", timeout: 120_000 });
      } else {
        spinner.stop();
        continue;
      }
      spinner.succeed(chalk.green(`✓ `) + chalk.bold(serverId) + chalk.dim(` updated`));
    } catch {
      spinner.warn(chalk.yellow(`~ `) + chalk.bold(serverId) + chalk.dim(` — could not update`));
    }
  }

  console.log(chalk.green("\n✓ Update complete\n"));
}

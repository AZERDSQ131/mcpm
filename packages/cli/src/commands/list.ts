import chalk from "chalk";
import { detectClients } from "../clients/detect.js";
import { listInstalledServers } from "../clients/config.js";
import { getServer } from "../registry.js";

export function list(): void {
  const clients = detectClients();
  const detected = clients.filter((c) => c.detected);

  if (detected.length === 0) {
    console.log(chalk.yellow("\nNo AI client detected.\n"));
    return;
  }

  console.log();

  let hasAny = false;

  for (const client of clients) {
    const servers = listInstalledServers(client);
    const entries = Object.entries(servers);
    const icon = client.detected ? chalk.green("●") : chalk.dim("○");
    const status = client.detected ? chalk.bold(client.name) : chalk.dim(client.name);

    console.log(`${icon} ${status}`);

    if (!client.detected) {
      console.log(chalk.dim("  (not detected)\n"));
      continue;
    }

    if (entries.length === 0) {
      console.log(chalk.dim("  No servers installed\n"));
      continue;
    }

    hasAny = true;

    for (const [id, config] of entries) {
      const known = getServer(id);
      const desc = known ? chalk.dim(` — ${known.description}`) : "";
      console.log(`  ${chalk.green("✓")} ${chalk.bold(id)}${desc}`);
      console.log(
        chalk.dim(`    ${config.command} ${config.args.join(" ")}`)
      );
    }
    console.log();
  }

  if (!hasAny) {
    console.log(
      chalk.dim("No servers installed. Run ") +
        chalk.italic("mcpm search") +
        chalk.dim(" to browse available servers.\n")
    );
  }
}

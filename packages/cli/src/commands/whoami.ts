import os from "os";
import chalk from "chalk";
import { detectClients } from "../clients/detect.js";
import { listInstalledServers } from "../clients/config.js";
import { readRC } from "./sync.js";
import { getCachePath } from "../cache.js";

/** Shows which AI clients are detected on this machine, their active config path, and what's installed. */
export function whoami(): void {
  const clients = detectClients();
  const detected = clients.filter((c) => c.detected);

  console.log(chalk.bold("\nmcpm whoami\n"));
  console.log(`${chalk.dim("Host:")}   ${os.hostname()}`);
  console.log(`${chalk.dim("Home:")}   ${os.homedir()}`);
  console.log(`${chalk.dim("Cache:")}  ${getCachePath()}`);

  const rc = readRC();
  console.log(`${chalk.dim(".mcpmrc:")} ${rc ? chalk.green("found in current directory") : chalk.dim("none")}`);
  console.log();

  if (detected.length === 0) {
    console.log(chalk.yellow("No AI client detected on this machine.\n"));
    return;
  }

  console.log(chalk.bold(`Detected clients (${detected.length}/${clients.length})`));
  for (const client of detected) {
    const servers = Object.keys(listInstalledServers(client));
    console.log(`  ${chalk.green("●")} ${chalk.bold(client.name)}`);
    console.log(`    ${chalk.dim("config:")} ${client.configPath}`);
    console.log(
      `    ${chalk.dim("servers:")} ${servers.length > 0 ? servers.join(", ") : chalk.dim("none installed")}`
    );
  }

  const notDetected = clients.filter((c) => !c.detected);
  if (notDetected.length > 0) {
    console.log(chalk.dim(`\nNot detected: ${notDetected.map((c) => c.name).join(", ")}`));
  }
  console.log();
}

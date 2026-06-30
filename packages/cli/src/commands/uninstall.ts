import chalk from "chalk";
import inquirer from "inquirer";
import { getDetectedClients } from "../clients/detect.js";
import { removeServer } from "../clients/config.js";

export async function uninstall(serverId: string): Promise<void> {
  const clients = getDetectedClients();

  if (clients.length === 0) {
    console.log(chalk.yellow("\nNo AI client detected.\n"));
    return;
  }

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      message: `Remove ${chalk.bold(serverId)} from all clients?`,
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log(chalk.dim("Aborted.\n"));
    return;
  }

  console.log();
  let removedCount = 0;

  for (const client of clients) {
    const removed = removeServer(client, serverId);
    if (removed) {
      console.log(
        chalk.green("✓ ") + chalk.bold(client.name) + chalk.dim(` — removed`)
      );
      removedCount++;
    } else {
      console.log(
        chalk.dim("~ ") + chalk.bold(client.name) + chalk.dim(` — not installed`)
      );
    }
  }

  if (removedCount > 0) {
    console.log(chalk.green(`\n✓ ${serverId} uninstalled\n`));
  } else {
    console.log(chalk.yellow(`\n~ ${serverId} was not installed in any client\n`));
  }
}

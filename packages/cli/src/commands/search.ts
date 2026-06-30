import chalk from "chalk";
import { searchServers, getAllServers } from "../registry.js";
import type { RegistryServer } from "../types.js";

export function search(query?: string): void {
  const results = query ? searchServers(query) : getAllServers();

  if (results.length === 0) {
    console.log(chalk.yellow(`\nNo servers found matching "${query}"\n`));
    return;
  }

  const label = query
    ? `${results.length} server${results.length > 1 ? "s" : ""} matching "${chalk.bold(query)}"`
    : `${results.length} servers available`;

  console.log(chalk.dim(`\n${label}\n`));

  for (const [id, server] of results) {
    printServer(id, server);
  }

  console.log(
    chalk.dim(`\nInstall a server: `) + chalk.italic(`mcpm install <name>\n`)
  );
}

function printServer(id: string, server: RegistryServer): void {
  const tags = server.tags
    .map((t) => chalk.cyan(`#${t}`))
    .join(" ");

  console.log(
    `  ${chalk.bold(id.padEnd(16))} ${server.description}`
  );
  console.log(`  ${" ".repeat(16)} ${tags}`);
  console.log();
}

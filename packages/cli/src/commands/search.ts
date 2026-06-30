import chalk from "chalk";
import { searchServers, getAllServers, getAllBundles } from "../registry.js";
import type { RegistryServer, RegistryBundle } from "../types.js";

export async function search(query?: string, showBundles?: boolean): Promise<void> {
  if (showBundles) {
    await printBundles();
    return;
  }

  const DEFAULT_LIMIT = 50;
  const all = query ? await searchServers(query) : await getAllServers();

  if (all.length === 0) {
    console.log(chalk.yellow(`\nNo servers found matching "${query}"\n`));
    return;
  }

  const results = query ? all : all.slice(0, DEFAULT_LIMIT);
  const total = all.length;

  const label = query
    ? `${total} server${total > 1 ? "s" : ""} matching "${chalk.bold(query)}"`
    : `Showing ${results.length} of ${total} servers`;

  console.log(chalk.dim(`\n${label}\n`));

  for (const [id, server] of results) {
    printServer(id, server);
  }

  if (!query && total > DEFAULT_LIMIT) {
    console.log(chalk.dim(`  … and ${total - DEFAULT_LIMIT} more — use `) + chalk.italic(`mcpm search <query>`) + chalk.dim(` to filter\n`));
  }

  console.log(chalk.dim(`Install: `) + chalk.italic(`mcpm install <name>`));
  console.log(chalk.dim(`Bundles: `) + chalk.italic(`mcpm search --bundles\n`));
}

async function printBundles(): Promise<void> {
  const bundles = await getAllBundles();
  console.log(chalk.dim(`\n${bundles.length} bundles available\n`));
  for (const [id, bundle] of bundles) {
    printBundle(id, bundle);
  }
  console.log(chalk.dim(`Install a bundle: `) + chalk.italic(`mcpm install @bundle/<name>\n`));
}

function printServer(id: string, server: RegistryServer): void {
  const tags = server.tags.map((t) => chalk.cyan(`#${t}`)).join(" ");
  console.log(`  ${chalk.bold(id.padEnd(16))} ${server.description}`);
  console.log(`  ${" ".repeat(16)} ${tags}`);
  console.log();
}

function printBundle(id: string, bundle: RegistryBundle): void {
  console.log(`  ${chalk.bold(("@bundle/" + id).padEnd(22))} ${bundle.description}`);
  console.log(`  ${" ".repeat(22)} ${bundle.servers.map((s) => chalk.cyan(s)).join(", ")}`);
  console.log();
}

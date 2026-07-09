import chalk from "chalk";
import { searchServers, getAllServers, getAllBundles } from "../registry.js";
import type { RegistryServer, RegistryBundle } from "../types.js";

const DEFAULT_LIMIT = 50;

function resolveLimit(rawLimit?: string): number {
  if (rawLimit === undefined) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.log(chalk.yellow(`\nInvalid --limit "${rawLimit}", falling back to ${DEFAULT_LIMIT}\n`));
    return DEFAULT_LIMIT;
  }
  return parsed;
}

export async function search(
  query?: string,
  showBundles?: boolean,
  rawLimit?: string,
  json?: boolean
): Promise<void> {
  if (showBundles) {
    if (json) {
      const bundles = await getAllBundles();
      console.log(JSON.stringify(Object.fromEntries(bundles), null, 2));
      return;
    }
    await printBundles();
    return;
  }

  const limit = resolveLimit(rawLimit);
  const all = query ? await searchServers(query) : await getAllServers();

  if (json) {
    console.log(JSON.stringify(Object.fromEntries(all), null, 2));
    return;
  }

  if (all.length === 0) {
    console.log(chalk.yellow(`\nNo servers found matching "${query}"\n`));
    return;
  }

  const results = all.slice(0, limit);
  const total = all.length;

  const label = query
    ? `Showing ${results.length} of ${total} server${total > 1 ? "s" : ""} matching "${chalk.bold(query)}"`
    : `Showing ${results.length} of ${total} servers`;

  console.log(chalk.dim(`\n${label}\n`));

  for (const [id, server] of results) {
    printServer(id, server);
  }

  if (total > limit) {
    const hint = query
      ? chalk.italic(`mcpm search "${query}" --limit ${total}`)
      : chalk.italic(`mcpm search --limit ${total}`);
    console.log(chalk.dim(`  … and ${total - limit} more — use `) + hint + chalk.dim(` to see them all\n`));
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

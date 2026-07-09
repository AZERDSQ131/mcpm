import chalk from "chalk";
import { getServer } from "../registry.js";

export async function info(serverId: string, json?: boolean): Promise<void> {
  const server = await getServer(serverId);

  if (!server) {
    if (json) {
      console.log(JSON.stringify({ error: `Unknown server: ${serverId}` }, null, 2));
      return;
    }
    console.log(chalk.red(`\nUnknown server: ${chalk.bold(serverId)}`));
    console.log(chalk.dim(`Run ${chalk.italic("mcpm search")} to browse available servers.\n`));
    return;
  }

  if (json) {
    console.log(JSON.stringify({ id: serverId, ...server }, null, 2));
    return;
  }

  const DOCKER_SKIP = new Set(["run", "-i", "--rm"]);
  const skipMap: Record<string, Set<string>> = {
    npx: new Set(["-y"]),
    uvx: new Set(["--from"]),
    docker: DOCKER_SKIP,
    go: new Set(["run"]),
    deno: new Set(["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-all"]),
  };
  const skip = skipMap[server.command] ?? new Set<string>();
  const pkg = server.args.find((a) => !a.startsWith("-") && !skip.has(a)) ?? "";

  let pkgUrl: string | null = null;
  let pkgLabel = "Package";
  if (pkg) {
    if (server.command === "uvx") {
      pkgUrl = `https://pypi.org/project/${pkg}`;
      pkgLabel = "PyPI";
    } else if (server.command === "docker") {
      const repo = pkg.split(":")[0];
      pkgUrl = repo.includes("/") ? `https://hub.docker.com/r/${repo}` : `https://hub.docker.com/_/${repo}`;
      pkgLabel = "Docker Hub";
    } else if (server.command === "go") {
      pkgUrl = `https://pkg.go.dev/${pkg.replace(/@[^@]+$/, "")}`;
      pkgLabel = "pkg.go.dev";
    } else if (server.command === "npx") {
      pkgUrl = `https://www.npmjs.com/package/${pkg}`;
      pkgLabel = "npm";
    }
  }

  console.log();
  console.log(chalk.bold(server.name));
  console.log(chalk.dim("─".repeat(40)));
  console.log(server.description);
  console.log();

  console.log(chalk.bold("Command"));
  console.log(`  ${server.command} ${server.args.join(" ")}`);
  console.log();

  const envEntries = Object.entries(server.env);
  if (envEntries.length > 0) {
    console.log(chalk.bold("Environment variables"));
    for (const [key, meta] of envEntries) {
      const req = meta.required ? chalk.red("required") : chalk.dim("optional");
      console.log(`  ${chalk.cyan(key)} ${req}`);
      console.log(`    ${chalk.dim(meta.description)}`);
    }
    console.log();
  }

  console.log(chalk.bold("Tags"));
  console.log("  " + server.tags.map((t) => chalk.cyan(`#${t}`)).join("  "));
  console.log();

  if (pkgUrl) {
    console.log(chalk.bold(pkgLabel));
    console.log(`  ${chalk.underline(pkgUrl)}`);
    console.log();
  }

  console.log(chalk.dim(`Install: `) + chalk.italic(`mcpm install ${serverId}`));
  console.log();
}

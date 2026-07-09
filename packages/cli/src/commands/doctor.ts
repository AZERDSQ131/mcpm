import chalk from "chalk";
import ora from "ora";
import { detectClients } from "../clients/detect.js";
import { listInstalledServers } from "../clients/config.js";
import { getServer } from "../registry.js";
import {
  extractPkg,
  hasCommand,
  fetchNpmVersion,
  fetchPyPIVersion,
  fetchDockerHubTag,
  fetchGoModuleVersion,
} from "../serverChecks.js";

interface ServerHealth {
  id: string;
  command: string;
  args: string[];
  status: "ok" | "broken" | "unknown";
  fix?: string;
}

export async function doctor(): Promise<void> {
  const clients = detectClients();

  console.log(chalk.bold("\nmcpm doctor\n"));

  // Runtime checks
  const runtimes = [
    { cmd: "npx",    label: "Node.js (npx)",    install: "https://nodejs.org" },
    { cmd: "uvx",    label: "Python (uvx)",      install: "curl -LsSf https://astral.sh/uv/install.sh | sh" },
    { cmd: "docker", label: "Docker",            install: "https://docs.docker.com/get-docker" },
    { cmd: "deno",   label: "Deno",              install: "curl -fsSL https://deno.land/install.sh | sh" },
    { cmd: "go",     label: "Go",                install: "https://go.dev/dl" },
  ] as const;

  console.log(chalk.bold("Runtimes"));
  const available: Record<string, boolean> = {};
  for (const rt of runtimes) {
    const ok = hasCommand(rt.cmd);
    available[rt.cmd] = ok;
    console.log(
      `  ${ok ? chalk.green("✓") : chalk.dim("○")} ${rt.label}` +
      (ok ? "" : chalk.dim(`  → ${rt.install}`))
    );
  }
  console.log();

  const allBroken: string[] = [];

  for (const client of clients) {
    const icon = client.detected ? chalk.green("●") : chalk.dim("○");
    console.log(`${icon} ${chalk.bold(client.name)}`);

    if (!client.detected) {
      console.log(chalk.dim("  not detected\n"));
      continue;
    }

    const servers = listInstalledServers(client);
    const entries = Object.entries(servers);

    if (entries.length === 0) {
      console.log(chalk.dim("  no servers installed\n"));
      continue;
    }

    const spinner = ora({ text: "Checking packages...", indent: 2 }).start();
    const results: ServerHealth[] = [];

    for (const [id, config] of entries) {
      const health = await checkServer(id, config.command, config.args, available);
      results.push(health);
    }

    spinner.stop();

    for (const result of results) {
      if (result.status === "ok") {
        console.log(`  ${chalk.green("✓")} ${chalk.bold(result.id)}`);
      } else if (result.status === "broken") {
        console.log(`  ${chalk.red("✗")} ${chalk.bold(result.id)} ${chalk.red("— package not found")}`);
        if (result.fix) console.log(`    ${chalk.dim("→")} ${chalk.cyan(result.fix)}`);
        allBroken.push(result.id);
      } else {
        console.log(`  ${chalk.yellow("~")} ${chalk.bold(result.id)} ${chalk.dim("— cannot verify")}`);
      }
    }

    console.log();
  }

  if (allBroken.length === 0) {
    console.log(chalk.green("✓ All servers healthy\n"));
  } else {
    console.log(chalk.red(`✗ ${allBroken.length} broken server${allBroken.length > 1 ? "s" : ""}: `) + allBroken.join(", "));
    console.log(chalk.dim("\nTo reinstall: ") + chalk.italic(`mcpm uninstall <name> && mcpm install <name>\n`));
  }
}

async function checkServer(
  id: string,
  command: string,
  args: string[],
  available: Record<string, boolean>
): Promise<ServerHealth> {
  const pkg = extractPkg(command, args);

  if (command === "npx") {
    if (!pkg) return { id, command, args, status: "unknown" };
    return fetchNpmVersion(pkg)
      ? { id, command, args, status: "ok" }
      : { id, command, args, status: "broken", fix: await suggestFix(id, pkg) };
  }

  if (command === "uvx") {
    if (!pkg) return { id, command, args, status: "unknown" };
    if (!available["uvx"]) return { id, command, args, status: "unknown" };
    return fetchPyPIVersion(pkg)
      ? { id, command, args, status: "ok" }
      : { id, command, args, status: "broken", fix: await suggestFix(id, pkg) };
  }

  if (command === "docker") {
    if (!pkg) return { id, command, args, status: "unknown" };
    if (!available["docker"]) return { id, command, args, status: "unknown" };
    return fetchDockerHubTag(pkg)
      ? { id, command, args, status: "ok" }
      : { id, command, args, status: "broken" };
  }

  if (command === "deno") {
    return { id, command, args, status: available["deno"] ? "ok" : "unknown" };
  }

  if (command === "go") {
    if (!pkg) return { id, command, args, status: "unknown" };
    if (!available["go"]) return { id, command, args, status: "unknown" };
    return fetchGoModuleVersion(pkg.replace(/@[^@]+$/, ""))
      ? { id, command, args, status: "ok" }
      : { id, command, args, status: "broken" };
  }

  return { id, command, args, status: "unknown" };
}

async function suggestFix(id: string, currentPkg: string): Promise<string | undefined> {
  const known = await getServer(id);
  const registryPkg = known ? extractPkg(known.command, known.args) : undefined;
  return registryPkg && registryPkg !== currentPkg
    ? `mcpm uninstall ${id} && mcpm install ${id}  (correct package: ${registryPkg})`
    : undefined;
}

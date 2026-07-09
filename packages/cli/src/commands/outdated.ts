import chalk from "chalk";
import ora from "ora";
import { detectClients } from "../clients/detect.js";
import { listInstalledServers } from "../clients/config.js";
import { getServer } from "../registry.js";
import {
  extractPkg,
  fetchNpmVersion,
  fetchPyPIVersion,
  fetchDockerHubTag,
  fetchGoModuleVersion,
} from "../serverChecks.js";

interface ServerStatus {
  id: string;
  currentPkg: string;
  registryPkg: string | null;
  latestVersion: string | null;
  pkgMismatch: boolean;
  status: "ok" | "outdated" | "mismatch" | "unknown";
}

export async function outdated(): Promise<void> {
  const clients = detectClients().filter((c) => c.detected);

  if (clients.length === 0) {
    console.log(chalk.yellow("\nNo AI client detected.\n"));
    return;
  }

  // Collect unique installed servers
  const installed = new Map<string, { command: string; args: string[] }>();
  for (const client of clients) {
    for (const [id, config] of Object.entries(listInstalledServers(client))) {
      if (!installed.has(id)) installed.set(id, config);
    }
  }

  if (installed.size === 0) {
    console.log(chalk.dim("\nNo servers installed.\n"));
    return;
  }

  const spinner = ora(`Checking ${installed.size} servers...`).start();
  const results: ServerStatus[] = [];

  for (const [id, config] of installed) {
    const known = await getServer(id);
    const currentPkg = extractPkg(config.command, config.args);
    const registryPkg = known ? extractPkg(known.command, known.args) : null;
    const pkgToCheck = registryPkg ?? currentPkg;
    const pkgMismatch = !!registryPkg && registryPkg !== currentPkg;

    let latestVersion: string | null = null;
    let status: ServerStatus["status"] = "unknown";

    if (config.command === "npx" && pkgToCheck) {
      latestVersion = fetchNpmVersion(pkgToCheck);
      status = latestVersion ? (pkgMismatch ? "mismatch" : "ok") : "unknown";
    } else if (config.command === "uvx" && pkgToCheck) {
      latestVersion = fetchPyPIVersion(pkgToCheck);
      status = latestVersion ? (pkgMismatch ? "mismatch" : "ok") : "unknown";
    } else if (config.command === "docker" && pkgToCheck) {
      latestVersion = fetchDockerHubTag(pkgToCheck);
      status = latestVersion ? "ok" : "unknown";
    } else if (config.command === "go" && pkgToCheck) {
      latestVersion = fetchGoModuleVersion(pkgToCheck.replace(/@[^@]+$/, ""));
      status = latestVersion ? (pkgMismatch ? "mismatch" : "ok") : "unknown";
    }

    results.push({ id, currentPkg, registryPkg, latestVersion, pkgMismatch, status });
  }

  spinner.stop();

  const mismatches = results.filter((r) => r.status === "mismatch");
  const ok = results.filter((r) => r.status === "ok");
  const unknown = results.filter((r) => r.status === "unknown");

  console.log();

  if (ok.length > 0) {
    console.log(chalk.bold("Up to date"));
    for (const r of ok) {
      console.log(
        `  ${chalk.green("✓")} ${chalk.bold(r.id.padEnd(16))} ${chalk.dim(r.latestVersion ?? "")}`
      );
    }
    console.log();
  }

  if (mismatches.length > 0) {
    console.log(chalk.bold("Package mismatch — reinstall to fix"));
    for (const r of mismatches) {
      console.log(
        `  ${chalk.yellow("!")} ${chalk.bold(r.id.padEnd(16))} ` +
          chalk.red(r.currentPkg) +
          chalk.dim(" → ") +
          chalk.green(r.registryPkg ?? "")
      );
      console.log(
        chalk.dim(`    mcpm uninstall ${r.id} && mcpm install ${r.id}`)
      );
    }
    console.log();
  }

  if (unknown.length > 0) {
    console.log(chalk.dim("Cannot check (non-npx or unknown package)"));
    for (const r of unknown) {
      console.log(`  ${chalk.dim("~")} ${chalk.dim(r.id)}`);
    }
    console.log();
  }

  if (mismatches.length === 0 && ok.length > 0) {
    console.log(chalk.green("✓ All servers are up to date\n"));
  }
}

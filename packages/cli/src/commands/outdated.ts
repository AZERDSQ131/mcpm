import chalk from "chalk";
import { execSync } from "child_process";
import ora from "ora";
import { detectClients } from "../clients/detect.js";
import { listInstalledServers } from "../clients/config.js";
import { getServer } from "../registry.js";

function extractPkg(command: string, args: string[]): string {
  const SKIP: Record<string, string[]> = {
    npx: ["-y"],
    uvx: ["--from"],
    docker: ["run", "-i", "--rm"],
    go: ["run"],
    deno: ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-all"],
  };
  const skip = new Set(SKIP[command] ?? []);
  return args.find((a) => !a.startsWith("-") && !skip.has(a)) ?? "";
}

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
      try {
        latestVersion = execSync(`npm view ${pkgToCheck} version`, {
          stdio: "pipe",
          timeout: 10_000,
        })
          .toString()
          .trim();
        status = pkgMismatch ? "mismatch" : "ok";
      } catch {
        status = "unknown";
      }
    } else if (config.command === "uvx" && pkgToCheck) {
      try {
        const out = execSync(`curl -sf "https://pypi.org/pypi/${pkgToCheck}/json"`, { stdio: "pipe", timeout: 10_000 });
        const data = JSON.parse(out.toString()) as { info?: { version?: string } };
        latestVersion = data.info?.version ?? null;
        status = latestVersion ? (pkgMismatch ? "mismatch" : "ok") : "unknown";
      } catch {
        status = "unknown";
      }
    } else if (config.command === "docker" && pkgToCheck) {
      try {
        const [repo, tag = "latest"] = pkgToCheck.split(":");
        const url = repo.includes("/")
          ? `https://hub.docker.com/v2/repositories/${repo}/tags/${tag}/`
          : `https://hub.docker.com/v2/repositories/library/${repo}/tags/${tag}/`;
        const out = execSync(`curl -sf "${url}"`, { stdio: "pipe", timeout: 10_000 });
        const data = JSON.parse(out.toString()) as { last_updated?: string; name?: string };
        latestVersion = data.last_updated ? tag : null;
        status = latestVersion ? "ok" : "unknown";
      } catch {
        status = "unknown";
      }
    } else if (config.command === "go" && pkgToCheck) {
      try {
        const mod = pkgToCheck.replace(/@[^@]+$/, "");
        const out = execSync(`curl -sf "https://proxy.golang.org/${mod}/@latest"`, { stdio: "pipe", timeout: 10_000 });
        const data = JSON.parse(out.toString()) as { Version?: string };
        latestVersion = data.Version ?? null;
        status = latestVersion ? (pkgMismatch ? "mismatch" : "ok") : "unknown";
      } catch {
        status = "unknown";
      }
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

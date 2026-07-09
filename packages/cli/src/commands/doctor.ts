import chalk from "chalk";
import { execFileSync } from "child_process";
import ora from "ora";
import { detectClients } from "../clients/detect.js";
import { listInstalledServers } from "../clients/config.js";
import { getServer } from "../registry.js";

interface ServerHealth {
  id: string;
  command: string;
  args: string[];
  status: "ok" | "broken" | "unknown";
  fix?: string;
}

function hasCommand(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function checkPyPI(pkg: string): boolean {
  try {
    const out = execFileSync("curl", ["-sf", `https://pypi.org/pypi/${pkg}/json`], { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(out.toString()) as { info?: { version?: string } };
    return !!data.info?.version;
  } catch {
    return false;
  }
}

function checkDockerHub(image: string): boolean {
  try {
    const [repo, tag = "latest"] = image.split(":");
    const url = repo.includes("/")
      ? `https://hub.docker.com/v2/repositories/${repo}/tags/${tag}/`
      : `https://hub.docker.com/v2/repositories/library/${repo}/tags/${tag}/`;
    const res = execFileSync("curl", ["-sf", url], { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(res.toString()) as { name?: string };
    return !!data.name;
  } catch {
    return false;
  }
}

function checkGoModule(mod: string): boolean {
  try {
    const res = execFileSync("curl", ["-sf", `https://proxy.golang.org/${mod}/@latest`], { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(res.toString()) as { Version?: string };
    return !!data.Version;
  } catch {
    return false;
  }
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
  if (command === "npx") {
    const pkg = args.find((a) => !a.startsWith("-") && a !== "-y");
    if (!pkg) return { id, command, args, status: "unknown" };
    try {
      execFileSync("npm", ["view", pkg, "version"], { stdio: "pipe", timeout: 10_000 });
      return { id, command, args, status: "ok" };
    } catch {
      const fix = await suggestFix(id, pkg);
      return { id, command, args, status: "broken", fix };
    }
  }

  if (command === "uvx") {
    const pkg = args.find((a) => !a.startsWith("-") && a !== "--from");
    if (!pkg) return { id, command, args, status: "unknown" };
    if (!available["uvx"]) return { id, command, args, status: "unknown" };
    return checkPyPI(pkg)
      ? { id, command, args, status: "ok" }
      : { id, command, args, status: "broken", fix: await suggestFix(id, pkg) };
  }

  if (command === "docker") {
    const image = args.find((a) => !a.startsWith("-") && a !== "run" && a !== "-i" && a !== "--rm");
    if (!image) return { id, command, args, status: "unknown" };
    if (!available["docker"]) return { id, command, args, status: "unknown" };
    return checkDockerHub(image)
      ? { id, command, args, status: "ok" }
      : { id, command, args, status: "broken" };
  }

  if (command === "deno") {
    return { id, command, args, status: available["deno"] ? "ok" : "unknown" };
  }

  if (command === "go") {
    const mod = args.find((a) => !a.startsWith("-") && a !== "run");
    if (!mod) return { id, command, args, status: "unknown" };
    if (!available["go"]) return { id, command, args, status: "unknown" };
    return checkGoModule(mod.replace(/@[^@]+$/, ""))
      ? { id, command, args, status: "ok" }
      : { id, command, args, status: "broken" };
  }

  return { id, command, args, status: "unknown" };
}

async function suggestFix(id: string, currentPkg: string): Promise<string | undefined> {
  const known = await getServer(id);
  const registryPkg = known?.args.find((a) => !a.startsWith("-") && a !== "-y" && a !== "--from");
  return registryPkg && registryPkg !== currentPkg
    ? `mcpm uninstall ${id} && mcpm install ${id}  (correct package: ${registryPkg})`
    : undefined;
}

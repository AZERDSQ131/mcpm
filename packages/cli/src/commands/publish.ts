import fs from "fs";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { execSync } from "child_process";
import { loadRegistry } from "../registry.js";

interface PkgJson {
  name?: string;
  description?: string;
  version?: string;
  bin?: Record<string, string>;
}

interface RegistryEntry {
  name: string;
  description: string;
  command: string;
  args: string[];
  env: Record<string, { description: string; required: boolean }>;
  tags: string[];
}

export async function publish(): Promise<void> {
  console.log(chalk.bold("\nmcpm publish — submit a server to the registry\n"));

  // Try to read local package.json
  const pkgPath = path.join(process.cwd(), "package.json");
  let detected: PkgJson = {};
  if (fs.existsSync(pkgPath)) {
    try {
      detected = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as PkgJson;
      if (detected.name) {
        console.log(chalk.dim(`Detected: ${detected.name} v${detected.version ?? "?"}\n`));
      }
    } catch {}
  }

  // Check if already in registry
  const registry = await loadRegistry();
  const existing = Object.entries(registry.servers).find(
    ([, s]) => s.args.some((a) => a === detected.name)
  );
  if (existing) {
    console.log(chalk.yellow(`~ ${detected.name} is already in the registry as "${existing[0]}"\n`));
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      { type: "confirm", name: "proceed", message: "Submit an update anyway?", default: false },
    ]);
    if (!proceed) return;
  }

  // Collect server details
  const answers = await inquirer.prompt<{
    id: string;
    displayName: string;
    description: string;
    runtime: "node" | "python" | "docker" | "go" | "deno";
    packageName: string;
    tags: string;
    hasEnv: boolean;
  }>([
    {
      type: "input",
      name: "id",
      message: "Registry ID (short, lowercase, used in mcpm install):",
      default: detected.name?.replace(/^@[^/]+\//, "") ?? "",
      validate: (v: string) => /^[a-z0-9-]+$/.test(v.trim()) || "Lowercase, numbers, hyphens only",
    },
    {
      type: "input",
      name: "displayName",
      message: "Display name:",
      default: detected.name ?? "",
      validate: (v: string) => v.trim().length > 0 || "Required",
    },
    {
      type: "input",
      name: "description",
      message: "Description (one line):",
      default: detected.description ?? "",
      validate: (v: string) => v.trim().length > 0 || "Required",
    },
    {
      type: "list",
      name: "runtime",
      message: "Runtime:",
      choices: [
        { name: "Node.js  — npm / npx",       value: "node" },
        { name: "Python   — PyPI / uvx",       value: "python" },
        { name: "Docker   — Docker Hub image", value: "docker" },
        { name: "Go       — go run module",    value: "go" },
        { name: "Deno     — deno run",         value: "deno" },
      ],
      default: "node",
    },
    {
      type: "input",
      name: "packageName",
      message: (a: { runtime: string }) => {
        if (a.runtime === "python") return "PyPI package name:";
        if (a.runtime === "docker") return "Docker image (e.g. mcp/fetch or ghcr.io/org/repo):";
        if (a.runtime === "go") return "Go module path (e.g. github.com/org/repo):";
        if (a.runtime === "deno") return "Deno URL or JSR specifier (e.g. jsr:@scope/pkg):";
        return "npm package name:";
      },
      default: detected.name ?? "",
      validate: (v: string) => v.trim().length > 0 || "Required",
    },
    {
      type: "input",
      name: "tags",
      message: "Tags (comma separated):",
      default: "",
    },
    {
      type: "confirm",
      name: "hasEnv",
      message: "Does this server require environment variables?",
      default: false,
    },
  ]);

  const envVars: Record<string, { description: string; required: boolean }> = {};

  if (answers.hasEnv) {
    let addMore = true;
    while (addMore) {
      const envAnswer = await inquirer.prompt<{
        key: string;
        description: string;
        required: boolean;
        more: boolean;
      }>([
        { type: "input", name: "key", message: "Env var name (e.g. GITHUB_TOKEN):", validate: (v: string) => v.trim().length > 0 || "Required" },
        { type: "input", name: "description", message: "Description:", validate: (v: string) => v.trim().length > 0 || "Required" },
        { type: "confirm", name: "required", message: "Required?", default: true },
        { type: "confirm", name: "more", message: "Add another env var?", default: false },
      ]);
      envVars[envAnswer.key] = { description: envAnswer.description, required: envAnswer.required };
      addMore = envAnswer.more;
    }
  }

  const { runtime, packageName } = answers;
  let command: string;
  let args: string[];
  if (runtime === "python") {
    command = "uvx"; args = [packageName];
  } else if (runtime === "docker") {
    command = "docker"; args = ["run", "-i", "--rm", packageName];
  } else if (runtime === "go") {
    command = "go"; args = ["run", packageName];
  } else if (runtime === "deno") {
    command = "deno"; args = ["run", "--allow-net", "--allow-env", packageName];
  } else {
    command = "npx"; args = ["-y", packageName];
  }
  const entry: RegistryEntry = {
    name: answers.displayName,
    description: answers.description,
    command,
    args,
    env: envVars,
    tags: answers.tags.split(",").map((t) => t.trim()).filter(Boolean),
  };

  console.log(chalk.bold("\nRegistry entry preview:\n"));
  console.log(chalk.dim(JSON.stringify({ [answers.id]: entry }, null, 2)));

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    { type: "confirm", name: "confirmed", message: "\nSubmit this to the registry?", default: true },
  ]);

  if (!confirmed) {
    console.log(chalk.dim("Aborted.\n"));
    return;
  }

  // Check gh is available
  const hasGh = commandExists("gh");
  const hasGit = commandExists("git");

  if (!hasGh || !hasGit) {
    printManualInstructions(answers.id, entry);
    return;
  }

  const spinner = ora("Opening pull request...").start();

  try {
    // Clone registry in a temp dir
    const tmp = `/tmp/mcpm-publish-${Date.now()}`;
    execSync(`gh repo fork AZERDSQ131/mcp-forge --clone --fork-name mcpm-publish-tmp 2>/dev/null || git clone https://github.com/AZERDSQ131/mcp-forge.git ${tmp}`, { stdio: "pipe", timeout: 30_000 });

    const repoDir = fs.existsSync(tmp) ? tmp : `${process.env.HOME}/mcpm-publish-tmp`;
    const registryFile = path.join(repoDir, "packages", "registry", "registry.json");

    const reg = JSON.parse(fs.readFileSync(registryFile, "utf-8"));
    reg.servers[answers.id] = entry;
    fs.writeFileSync(registryFile, JSON.stringify(reg, null, 2) + "\n");

    const branch = `add-${answers.id}`;
    execSync(`git -C ${repoDir} checkout -b ${branch}`, { stdio: "pipe" });
    execSync(`git -C ${repoDir} add packages/registry/registry.json`, { stdio: "pipe" });
    execSync(`git -C ${repoDir} commit -m "Add ${answers.id} to registry"`, { stdio: "pipe" });
    execSync(`git -C ${repoDir} push origin ${branch}`, { stdio: "pipe", timeout: 15_000 });
    execSync(
      `gh pr create --repo AZERDSQ131/mcp-forge --title "Add ${answers.displayName} to registry" --body "Adds \`${answers.id}\` — ${answers.description}\n\nPackage: \`${answers.packageName}\`" --head ${branch}`,
      { stdio: "pipe", timeout: 15_000 }
    );

    execSync(`rm -rf ${repoDir}`, { stdio: "pipe" });

    spinner.succeed("Pull request opened!");
    console.log(chalk.dim("\nOnce merged, anyone can install your server with:"));
    console.log(chalk.cyan(`  mcpm install ${answers.id}\n`));
  } catch {
    spinner.stop();
    printManualInstructions(answers.id, entry);
  }
}

function printManualInstructions(id: string, entry: RegistryEntry): void {
  console.log(chalk.bold("\nAdd this to packages/registry/registry.json and open a PR:\n"));
  console.log(chalk.dim(JSON.stringify({ [id]: entry }, null, 2)));
  console.log(chalk.dim("\nhttps://github.com/AZERDSQ131/mcp-forge/edit/main/packages/registry/registry.json\n"));
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

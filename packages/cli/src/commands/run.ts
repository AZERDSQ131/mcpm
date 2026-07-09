import fs from "fs";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import { spawn } from "child_process";
import { getServer } from "../registry.js";
import type { RegistryServer } from "../types.js";

interface McpTool {
  name: string;
  description?: string;
}

function resolveLocal(serverId: string): RegistryServer | null {
  if (serverId !== "." && !serverId.startsWith("./") && !serverId.startsWith("/")) return null;
  const dir = serverId === "." ? process.cwd() : path.resolve(serverId);
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      name?: string; description?: string; scripts?: Record<string, string>;
    };
    const startScript = pkg.scripts?.start ?? `node dist/index.js`;
    const [cmd, ...args] = startScript.split(" ");
    return {
      name: pkg.name ?? dir,
      description: pkg.description ?? "Local MCP server",
      command: cmd,
      args,
      env: {},
      tags: ["local"],
    };
  } catch {
    return null;
  }
}

export async function run(serverId: string, opts: { yes?: boolean } = {}): Promise<void> {
  const local = resolveLocal(serverId);
  const server = local ?? (await getServer(serverId));

  if (!server) {
    console.log(chalk.red(`\nUnknown server: ${chalk.bold(serverId)}`));
    console.log(chalk.dim(`Run ${chalk.italic("mcpm search")} to browse available servers.\n`));
    return;
  }

  if (!opts.yes) {
    console.log(chalk.bold(`\n${server.name}`) + chalk.dim(` will run:`));
    console.log(chalk.cyan(`  ${server.command} ${server.args.join(" ")}\n`));
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: "confirm",
        name: "proceed",
        message: "Continue?",
        default: false,
      },
    ]);
    if (!proceed) {
      console.log(chalk.yellow("\nCancelled.\n"));
      return;
    }
  }

  console.log(chalk.bold(`\nRunning ${server.name} temporarily...`));
  console.log(chalk.dim("Nothing will be saved to your config.\n"));

  // Prompt for required env vars
  const envValues: Record<string, string> = {};
  for (const [key, meta] of Object.entries(server.env)) {
    if (meta.required) {
      const { value } = await inquirer.prompt<{ value: string }>([
        {
          type: "password",
          name: "value",
          message: `${key} — ${chalk.dim(meta.description)}:`,
          mask: "*",
          validate: (i: string) => i.trim().length > 0 || `${key} is required`,
        },
      ]);
      envValues[key] = value.trim();
    }
  }

  const env = { ...process.env, ...envValues };
  const [cmd, ...args] = [server.command, ...server.args];

  console.log(chalk.dim(`\nStarting: ${cmd} ${args.join(" ")}\n`));

  const proc = spawn(cmd, args, { env, stdio: ["pipe", "pipe", "inherit"] });

  let buffer = "";
  let initialized = false;
  let toolsListed = false;

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as {
          id?: number;
          result?: {
            serverInfo?: { name: string; version: string };
            tools?: McpTool[];
          };
        };

        if (msg.id === 1 && msg.result?.serverInfo && !initialized) {
          initialized = true;
          const si = msg.result.serverInfo;
          console.log(chalk.green(`✓ Connected to ${si.name} v${si.version}`));

          // Send notifications/initialized then tools/list
          proc.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"
          );
          proc.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n"
          );
        }

        if (msg.id === 2 && msg.result?.tools && !toolsListed) {
          toolsListed = true;
          const tools = msg.result.tools;
          console.log(chalk.bold(`\n${tools.length} tool${tools.length !== 1 ? "s" : ""} available:\n`));
          for (const tool of tools) {
            console.log(`  ${chalk.cyan(tool.name)}`);
            if (tool.description) console.log(`    ${chalk.dim(tool.description)}`);
          }
          console.log(chalk.dim("\nPress Ctrl+C to stop.\n"));
        }
      } catch {
        // Not JSON, ignore
      }
    }
  });

  // MCP handshake: initialize
  proc.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcpm", version: "0.1.0" },
      },
    }) + "\n"
  );

  // Keep alive until Ctrl+C
  process.on("SIGINT", () => {
    console.log(chalk.dim("\nStopping server..."));
    proc.kill();
    process.exit(0);
  });

  proc.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`\nServer exited with code ${code}\n`));
    }
    process.exit(0);
  });
}

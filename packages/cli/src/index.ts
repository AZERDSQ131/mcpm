#!/usr/bin/env node
import { createRequire } from "module";
import { Command } from "commander";
import chalk from "chalk";
import { install } from "./commands/install.js";
import { uninstall } from "./commands/uninstall.js";
import { search } from "./commands/search.js";
import { info } from "./commands/info.js";
import { list } from "./commands/list.js";
import { update } from "./commands/update.js";
import { outdated } from "./commands/outdated.js";
import { doctor } from "./commands/doctor.js";
import { run } from "./commands/run.js";
import { sync } from "./commands/sync.js";
import { rollback } from "./commands/rollback.js";
import { exportConfig, importConfig } from "./commands/exportImport.js";
import { completion, printCompletionHelp } from "./commands/completion.js";
import { create } from "./commands/create.js";
import { publish } from "./commands/publish.js";
import { cacheInfo, cacheClear } from "./commands/cache.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

const BANNER = `
  ${chalk.bold("mcpm")} ${chalk.dim("— universal MCP server manager")}
`;

program
  .name("mcpm")
  .description("Install and manage MCP servers across all your AI clients")
  .version(version)
  .addHelpText("before", BANNER);

program
  .command("install <servers...>")
  .alias("i")
  .description("Install one or more servers or a bundle (@bundle/<name>)")
  .option("--save", "Save to .mcpmrc")
  .option("--force", "Reinstall even if already installed, re-prompting for env vars")
  .action(async (servers: string[], opts: { save?: boolean; force?: boolean }) => {
    await install(servers, { save: opts.save, force: opts.force });
  });

program
  .command("uninstall <server>")
  .alias("remove")
  .alias("rm")
  .description("Uninstall an MCP server")
  .action(async (server: string) => {
    await uninstall(server);
  });

program
  .command("search [query]")
  .alias("s")
  .description("Search the MCP server registry")
  .option("--bundles", "Show available bundles")
  .option("--limit <n>", "Max number of results to show (default: 50)")
  .option("--json", "Output as JSON")
  .action((query?: string, opts?: { bundles?: boolean; limit?: string; json?: boolean }) => {
    search(query, opts?.bundles, opts?.limit, opts?.json);
  });

program
  .command("info <server>")
  .description("Show detailed info about an MCP server")
  .option("--json", "Output as JSON")
  .action(async (server: string, opts?: { json?: boolean }) => {
    await info(server, opts?.json);
  });

program
  .command("list")
  .alias("ls")
  .description("List installed MCP servers across all clients")
  .option("--json", "Output as JSON")
  .action(async (opts?: { json?: boolean }) => {
    await list(opts?.json);
  });

program
  .command("create [name]")
  .description("Scaffold a new MCP server project")
  .option("--ai <description>", "Describe what the server should do — AI writes the implementation")
  .action(async (name?: string, opts?: { ai?: string }) => {
    await create(name, { ai: opts?.ai });
  });

program
  .command("publish")
  .description("Submit your MCP server to the registry")
  .action(async () => {
    await publish();
  });

program
  .command("run <server>")
  .description("Run a server temporarily to see its tools — use '.' for local server")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(async (server: string, opts: { yes?: boolean }) => {
    await run(server, { yes: opts.yes });
  });

program
  .command("sync")
  .description("Install all servers listed in .mcpmrc")
  .option("--dry-run", "Preview rendered client config changes without writing")
  .option("--receipt <file>", "Write a dry-run rendered-output receipt JSON")
  .action(async (opts: { dryRun?: boolean; receipt?: string }) => {
    await sync({ dryRun: opts.dryRun, receipt: opts.receipt });
  });

program
  .command("rollback")
  .description("Restore client configs from the latest rollback snapshot")
  .option("--snapshot <dir>", "Restore from a specific rollback snapshot directory")
  .option("--list", "List available snapshots without restoring anything")
  .action(async (opts: { snapshot?: string; list?: boolean }) => {
    await rollback({ snapshot: opts.snapshot, list: opts.list });
  });

program
  .command("update")
  .description("Update all installed MCP servers to latest versions")
  .action(async () => {
    await update();
  });

program
  .command("outdated")
  .description("Check which installed servers have updates or package mismatches")
  .action(async () => {
    await outdated();
  });

program
  .command("doctor")
  .description("Check health of all installed MCP servers")
  .action(async () => {
    await doctor();
  });

program
  .command("export [file]")
  .description("Export installed servers to a JSON file (or stdout)")
  .action((file?: string) => {
    exportConfig(file);
  });

program
  .command("import <file>")
  .description("Import and install servers from an export file")
  .action(async (file: string) => {
    await importConfig(file);
  });

const cacheCommand = program.command("cache").description("Manage the local registry cache");

cacheCommand
  .command("info")
  .description("Show registry cache status (path, size, age, TTL)")
  .action(() => {
    cacheInfo();
  });

cacheCommand
  .command("clear")
  .description("Delete the local registry cache")
  .action(() => {
    cacheClear();
  });

program
  .command("completion <shell>")
  .description("Generate shell completion script (bash, zsh, fish)")
  .action((shell: string) => {
    if (!shell) {
      printCompletionHelp();
    } else {
      completion(shell as "bash" | "zsh" | "fish");
    }
  });

program.addHelpText(
  "after",
  `
${chalk.dim("Examples:")}
  ${chalk.italic("mcpm install github --save")}           install and save to .mcpmrc
  ${chalk.italic("mcpm install github --force")}          reconfigure an already-installed server
  ${chalk.italic("mcpm install @bundle/webdev")}          install the Web Dev bundle
  ${chalk.italic("mcpm sync")}                            install all servers in .mcpmrc
  ${chalk.italic("mcpm rollback")}                        restore latest config snapshot
  ${chalk.italic("mcpm rollback --list")}                 list available snapshots
  ${chalk.italic("mcpm run fetch")}                       test a server without installing
  ${chalk.italic("mcpm outdated")}                        check for updates
  ${chalk.italic("mcpm search --bundles")}                browse available bundles
  ${chalk.italic("mcpm search fetch --limit 5")}          cap the number of results shown
  ${chalk.italic("mcpm info postgres")}                   show details about a server
  ${chalk.italic("mcpm doctor")}                          check server health
  ${chalk.italic("mcpm cache info")}                      inspect the registry cache
  ${chalk.italic("mcpm cache clear")}                     force a fresh registry fetch
  ${chalk.italic("mcpm export ~/my-mcp-setup.json")}      backup your setup
  ${chalk.italic("mcpm import ~/my-mcp-setup.json")}      restore on a new machine
  ${chalk.italic('mcpm create --ai "fetch crypto prices"')} AI writes the implementation
  ${chalk.italic("mcpm create my-server")}               scaffold a new MCP server
  ${chalk.italic("mcpm run .")}                          test your local server
  ${chalk.italic("mcpm publish")}                        submit your server to registry
  ${chalk.italic('eval "$(mcpm completion zsh)"')}       enable tab completion
`
);

program.parse(process.argv);

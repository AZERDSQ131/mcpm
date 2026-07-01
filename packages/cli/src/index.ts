#!/usr/bin/env node
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
import { exportConfig, importConfig } from "./commands/exportImport.js";
import { completion, printCompletionHelp } from "./commands/completion.js";
import { create } from "./commands/create.js";
import { publish } from "./commands/publish.js";

const program = new Command();

const BANNER = `
  ${chalk.bold("mcpm")} ${chalk.dim("— universal MCP server manager")}
`;

program
  .name("mcpm")
  .description("Install and manage MCP servers across all your AI clients")
  .version("0.1.0")
  .addHelpText("before", BANNER);

program
  .command("install <servers...>")
  .alias("i")
  .description("Install one or more servers or a bundle (@bundle/<name>)")
  .option("--save", "Save to .mcpmrc")
  .action(async (servers: string[], opts: { save?: boolean }) => {
    await install(servers, { save: opts.save });
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
  .action((query?: string, opts?: { bundles?: boolean }) => {
    search(query, opts?.bundles);
  });

program
  .command("info <server>")
  .description("Show detailed info about an MCP server")
  .action(async (server: string) => {
    await info(server);
  });

program
  .command("list")
  .alias("ls")
  .description("List installed MCP servers across all clients")
  .action(async () => {
    await list();
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
  .action(async (server: string) => {
    await run(server);
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
  ${chalk.italic("mcpm install @bundle/webdev")}          install the Web Dev bundle
  ${chalk.italic("mcpm sync")}                            install all servers in .mcpmrc
  ${chalk.italic("mcpm run fetch")}                       test a server without installing
  ${chalk.italic("mcpm outdated")}                        check for updates
  ${chalk.italic("mcpm search --bundles")}                browse available bundles
  ${chalk.italic("mcpm info postgres")}                   show details about a server
  ${chalk.italic("mcpm doctor")}                          check server health
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

#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { install } from "./commands/install.js";
import { uninstall } from "./commands/uninstall.js";
import { search } from "./commands/search.js";
import { list } from "./commands/list.js";
import { update } from "./commands/update.js";
import { doctor } from "./commands/doctor.js";
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
    .description("Install one or more MCP servers")
    .action(async (servers) => {
    await install(servers);
});
program
    .command("uninstall <server>")
    .alias("remove")
    .alias("rm")
    .description("Uninstall an MCP server")
    .action(async (server) => {
    await uninstall(server);
});
program
    .command("search [query]")
    .alias("s")
    .description("Search the MCP server registry")
    .action((query) => {
    search(query);
});
program
    .command("list")
    .alias("ls")
    .description("List installed MCP servers across all clients")
    .action(() => {
    list();
});
program
    .command("update")
    .description("Update all installed MCP servers to latest versions")
    .action(async () => {
    await update();
});
program
    .command("doctor")
    .description("Check health of all installed MCP servers")
    .action(async () => {
    await doctor();
});
program.addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.italic("mcpm install github")}                 install GitHub MCP server
  ${chalk.italic("mcpm install obsidian postgres stripe")}  install multiple servers
  ${chalk.italic('mcpm search "database"')}             search the registry
  ${chalk.italic("mcpm list")}                          show all installed servers
  ${chalk.italic("mcpm update")}                        update all servers
  ${chalk.italic("mcpm uninstall github")}              remove a server
`);
program.parse(process.argv);
//# sourceMappingURL=index.js.map
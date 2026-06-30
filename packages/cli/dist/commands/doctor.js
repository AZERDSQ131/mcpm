import chalk from "chalk";
import { execSync } from "child_process";
import ora from "ora";
import { detectClients } from "../clients/detect.js";
import { listInstalledServers } from "../clients/config.js";
import { getServer } from "../registry.js";
export async function doctor() {
    const clients = detectClients();
    console.log(chalk.bold("\nmcpm doctor\n"));
    const allBroken = [];
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
        const results = [];
        const spinner = ora({ text: "Checking packages...", indent: 2 }).start();
        for (const [id, config] of entries) {
            const health = await checkServer(id, config.command, config.args);
            results.push(health);
        }
        spinner.stop();
        for (const result of results) {
            if (result.status === "ok") {
                console.log(`  ${chalk.green("✓")} ${chalk.bold(result.id)}`);
            }
            else if (result.status === "broken") {
                console.log(`  ${chalk.red("✗")} ${chalk.bold(result.id)} ${chalk.red("— package not found")}`);
                if (result.fix) {
                    console.log(`    ${chalk.dim("→")} ${chalk.cyan(result.fix)}`);
                }
                allBroken.push(result.id);
            }
            else {
                console.log(`  ${chalk.yellow("~")} ${chalk.bold(result.id)} ${chalk.dim("— cannot verify (non-npx)")}`);
            }
        }
        console.log();
    }
    if (allBroken.length === 0) {
        console.log(chalk.green("✓ All servers healthy\n"));
    }
    else {
        console.log(chalk.red(`✗ ${allBroken.length} broken server${allBroken.length > 1 ? "s" : ""}: `) +
            allBroken.join(", "));
        console.log(chalk.dim("\nTo reinstall: ") +
            chalk.italic(`mcpm uninstall <name> && mcpm install <name>\n`));
    }
}
async function checkServer(id, command, args) {
    if (command !== "npx") {
        return { id, command, args, status: "unknown" };
    }
    const pkg = args.find((a) => !a.startsWith("-") && a !== "-y");
    if (!pkg) {
        return { id, command, args, status: "unknown" };
    }
    try {
        execSync(`npm view ${pkg} version`, { stdio: "pipe", timeout: 10_000 });
        return { id, command, args, status: "ok" };
    }
    catch {
        const known = getServer(id);
        const registryPkg = known?.args.find((a) => !a.startsWith("-") && a !== "-y") ?? undefined;
        const fix = registryPkg && registryPkg !== pkg
            ? `mcpm uninstall ${id} && mcpm install ${id}  (correct package: ${registryPkg})`
            : undefined;
        return { id, command, args, status: "broken", fix };
    }
}
//# sourceMappingURL=doctor.js.map
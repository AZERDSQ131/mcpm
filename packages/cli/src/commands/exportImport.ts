import fs from "fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { detectClients } from "../clients/detect.js";
import { listInstalledServers, addServer } from "../clients/config.js";
import { colorizeJson } from "../jsonColor.js";
import type { ExportFormat } from "../types.js";

export function exportConfig(outputPath?: string): void {
  const clients = detectClients().filter((c) => c.detected);

  if (clients.length === 0) {
    console.log(chalk.yellow("\nNo AI client detected.\n"));
    return;
  }

  // Merge all servers across clients (union — first occurrence wins)
  const merged: ExportFormat["servers"] = {};
  for (const client of clients) {
    const servers = listInstalledServers(client);
    for (const [id, config] of Object.entries(servers)) {
      if (!merged[id]) {
        // Strip type field for portability
        const { type: _type, ...portable } = config;
        merged[id] = portable;
      }
    }
  }

  const exportData: ExportFormat = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    servers: merged,
  };

  const json = JSON.stringify(exportData, null, 2) + "\n";

  if (outputPath) {
    fs.writeFileSync(outputPath, json, "utf-8");
    console.log(
      chalk.green(`\n✓ Exported ${Object.keys(merged).length} servers to ${chalk.bold(outputPath)}\n`)
    );
  } else if (process.stdout.isTTY) {
    // Interactive terminal: colorize for readability. Piped/redirected output stays
    // plain so it remains valid JSON for tools like jq or a shell redirect.
    process.stdout.write(colorizeJson(json));
  } else {
    process.stdout.write(json);
  }
}

export async function importConfig(inputPath: string): Promise<void> {
  if (!fs.existsSync(inputPath)) {
    console.log(chalk.red(`\nFile not found: ${inputPath}\n`));
    return;
  }

  let data: ExportFormat;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as ExportFormat;
  } catch {
    console.log(chalk.red("\nInvalid JSON file.\n"));
    return;
  }

  const servers = Object.entries(data.servers);
  if (servers.length === 0) {
    console.log(chalk.yellow("\nNo servers found in export file.\n"));
    return;
  }

  const clients = detectClients().filter((c) => c.detected);
  if (clients.length === 0) {
    console.log(chalk.yellow("\nNo AI client detected.\n"));
    return;
  }

  console.log(
    chalk.dim(`\nImporting ${servers.length} servers from ${chalk.bold(inputPath)}`)
  );
  console.log(chalk.dim(`Exported: ${data.exportedAt}\n`));

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      message: `Install ${servers.length} servers into ${clients.length} client${clients.length > 1 ? "s" : ""}?`,
      default: true,
    },
  ]);

  if (!confirmed) {
    console.log(chalk.dim("Aborted.\n"));
    return;
  }

  console.log();
  for (const [id, config] of servers) {
    for (const client of clients) {
      addServer(client, id, config);
    }
    console.log(chalk.green("✓ ") + chalk.bold(id));
  }

  console.log(
    chalk.green(`\n✓ Imported ${servers.length} servers into ${clients.length} client${clients.length > 1 ? "s" : ""}\n`)
  );
}

import fs from "fs";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { execSync, spawn } from "child_process";

interface CreateOptions {
  name: string;
  description: string;
  author: string;
  toolName: string;
  toolDescription: string;
}

// AI clients in order of preference
const AI_CLIENTS = [
  { cmd: "claude", name: "Claude Code", flag: "" },
  { cmd: "codex", name: "OpenAI Codex", flag: "" },
  { cmd: "opencode", name: "OpenCode", flag: "" },
];

function detectAIClient(): { cmd: string; name: string } | null {
  for (const client of AI_CLIENTS) {
    try {
      execSync(`which ${client.cmd}`, { stdio: "pipe" });
      return client;
    } catch {}
  }
  return null;
}

function buildAIPrompt(opts: {
  name: string;
  description: string;
  author: string;
  toolName: string;
  toolDescription: string;
  dir: string;
}): string {
  const { name, description, author, toolName, toolDescription, dir } = opts;

  return `You are building a production-ready MCP (Model Context Protocol) server.

## Task

Create a complete MCP server called \`${name}\` in the directory \`${dir}\`.

**Description:** ${description}
**Main tool to implement:** \`${toolName}\` — ${toolDescription}

## Project structure (already scaffolded)

The directory \`${dir}\` already exists with:
- \`package.json\` (dependencies installed)
- \`tsconfig.json\`
- \`src/index.ts\` (skeleton to replace)
- \`node_modules/\`

## What to write

Replace \`${dir}/src/index.ts\` with a complete, working implementation.

Use exactly this SDK pattern:

\`\`\`typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "${name}",
  version: "1.0.0",
});

server.tool(
  "tool-name",
  "Tool description",
  { param: z.string().describe("what this param does") },
  async ({ param }) => ({
    content: [{ type: "text", text: "result" }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
\`\`\`

## Requirements

1. Implement \`${toolName}\` so it actually does: **${toolDescription}**
2. Add real logic — fetch real data, call real APIs, or process real input
3. Add proper zod schemas for all inputs
4. Handle errors gracefully with try/catch
5. If the tool needs an API key or URL, read it from \`process.env\` and throw a clear error if missing
6. Add more tools if they make sense for this use case
7. After writing the file, run: \`cd ${dir} && npm run build\`

Author: ${author}

Start immediately — write \`${dir}/src/index.ts\` now.`;
}

export async function create(serverName?: string, opts: { ai?: string } = {}): Promise<void> {
  const isAI = opts.ai !== undefined;

  console.log(
    chalk.bold(`\nmcpm create${isAI ? " --ai" : ""} — scaffold a new MCP server\n`)
  );

  const questions = [
    {
      type: "input",
      name: "name",
      message: "Server name:",
      default: serverName ?? opts.ai?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") ?? "my-mcp-server",
      validate: (v: string) =>
        /^[a-z0-9-]+$/.test(v.trim()) || "Lowercase letters, numbers, hyphens only",
    },
    {
      type: "input",
      name: "description",
      message: "Description:",
      default: opts.ai ?? "",
      validate: (v: string) => v.trim().length > 0 || "Required",
    },
    {
      type: "input",
      name: "author",
      message: "Author:",
      default: getGitUser(),
    },
    {
      type: "input",
      name: "toolName",
      message: "Main tool name:",
      default: opts.ai
        ? opts.ai.toLowerCase().split(" ").slice(0, 2).join("_").replace(/[^a-z0-9_]/g, "")
        : "hello",
      validate: (v: string) =>
        /^[a-z0-9_-]+$/.test(v.trim()) || "Lowercase, numbers, hyphens, underscores",
    },
    {
      type: "input",
      name: "toolDescription",
      message: "Tool description:",
      default: opts.ai ?? "A sample tool",
    },
  ] as const;

  const answers = await inquirer.prompt<CreateOptions>(questions as never);
  const { name, description, author, toolName, toolDescription } = answers;
  const dir = path.join(process.cwd(), name);

  if (fs.existsSync(dir)) {
    console.log(chalk.red(`\n✗ Directory ${name} already exists.\n`));
    return;
  }

  // Scaffold the base project
  const spinner = ora("Scaffolding project...").start();
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        description,
        author,
        license: "MIT",
        type: "module",
        bin: { [name]: "./dist/index.js" },
        scripts: {
          build: "tsc",
          dev: "node --loader ts-node/esm src/index.ts",
          start: "node dist/index.js",
          prepare: "npm run build",
        },
        files: ["dist"],
        keywords: ["mcp", "model-context-protocol", name],
        dependencies: {
          "@modelcontextprotocol/sdk": "^1.10.2",
          zod: "^3.22.4",
        },
        devDependencies: {
          "@types/node": "^20.14.0",
          "ts-node": "^10.9.2",
          typescript: "^5.4.5",
        },
        engines: { node: ">=18" },
      },
      null,
      2
    ) + "\n"
  );

  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          outDir: "./dist",
          rootDir: "./src",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist"],
      },
      null,
      2
    ) + "\n"
  );

  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\ndist/\n.env\n");

  // Skeleton src/index.ts — AI will replace this
  fs.writeFileSync(
    path.join(dir, "src", "index.ts"),
    `#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "${name}", version: "1.0.0" });

server.tool(
  "${toolName}",
  "${toolDescription}",
  { input: z.string().describe("Input parameter") },
  async ({ input }) => ({
    content: [{ type: "text", text: \`Result: \${input}\` }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
`
  );

  spinner.text = "Installing dependencies...";
  try {
    execSync("npm install", { cwd: dir, stdio: "pipe", timeout: 60_000 });
    spinner.succeed(`Project scaffolded at ${chalk.bold(name)}/`);
  } catch {
    spinner.warn("Scaffold done — run npm install manually if needed");
  }

  if (!isAI) {
    printNextSteps(name);
    return;
  }

  // AI mode — detect client and inject prompt
  const client = detectAIClient();

  if (!client) {
    console.log(chalk.yellow("\nNo AI client detected (claude, codex, opencode)."));
    console.log(chalk.dim("Install one and re-run, or implement src/index.ts manually.\n"));
    printNextSteps(name);
    return;
  }

  const prompt = buildAIPrompt({ name, description, author, toolName, toolDescription, dir });

  console.log(
    `\n${chalk.green("✓")} Detected ${chalk.bold(client.name)}\n`
  );
  console.log(chalk.bold("Prompt being injected:\n"));
  console.log(chalk.dim("─".repeat(60)));
  console.log(chalk.dim(prompt));
  console.log(chalk.dim("─".repeat(60)));
  console.log();

  const { go } = await inquirer.prompt<{ go: boolean }>([
    {
      type: "confirm",
      name: "go",
      message: `Launch ${client.name} with this prompt?`,
      default: true,
    },
  ]);

  if (!go) {
    console.log(chalk.dim("\nAborted. Scaffold is ready at " + dir + "\n"));
    return;
  }

  console.log(chalk.dim(`\nLaunching ${client.name}...\n`));

  // Spawn AI client with the prompt — visible, interactive
  const proc = spawn(client.cmd, [prompt], {
    cwd: dir,
    stdio: "inherit",
    shell: false,
  });

  proc.on("close", (code) => {
    if (code === 0) {
      console.log(chalk.green("\n✓ Done! Test your server:\n"));
      console.log(`  ${chalk.cyan(`cd ${name}`)}`);
      console.log(`  ${chalk.cyan("mcpm run .")}\n`);
    }
  });
}

function printNextSteps(name: string): void {
  console.log(`
${chalk.bold("Next steps:")}

  ${chalk.cyan(`cd ${name}`)}
  ${chalk.cyan("mcpm run .")}              ${chalk.dim("test your server")}
  ${chalk.cyan("code src/index.ts")}       ${chalk.dim("implement your tools")}
  ${chalk.cyan("mcpm publish")}            ${chalk.dim("submit to the registry")}
`);
}

function getGitUser(): string {
  try {
    return execSync("git config user.name", { stdio: "pipe" }).toString().trim();
  } catch {
    return "";
  }
}

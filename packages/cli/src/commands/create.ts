import fs from "fs";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { execSync } from "child_process";

interface CreateOptions {
  name: string;
  description: string;
  author: string;
  toolName: string;
  toolDescription: string;
}

export async function create(serverName?: string): Promise<void> {
  console.log(chalk.bold("\nmcpm create — scaffold a new MCP server\n"));

  const answers = await inquirer.prompt<CreateOptions>([
    {
      type: "input",
      name: "name",
      message: "Server name:",
      default: serverName ?? "my-mcp-server",
      validate: (v: string) =>
        /^[a-z0-9-]+$/.test(v.trim()) || "Use lowercase letters, numbers, and hyphens only",
    },
    {
      type: "input",
      name: "description",
      message: "Description:",
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
      message: "First tool name:",
      default: "hello",
      validate: (v: string) =>
        /^[a-z0-9_-]+$/.test(v.trim()) || "Use lowercase letters, numbers, hyphens, underscores",
    },
    {
      type: "input",
      name: "toolDescription",
      message: "First tool description:",
      default: "A sample tool",
    },
  ]);

  const { name, description, author, toolName, toolDescription } = answers;
  const dir = path.join(process.cwd(), name);

  if (fs.existsSync(dir)) {
    console.log(chalk.red(`\n✗ Directory ${name} already exists.\n`));
    return;
  }

  const spinner = ora("Generating project...").start();

  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  // package.json
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

  // tsconfig.json
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

  // .gitignore
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\ndist/\n.env\n");

  // src/index.ts
  fs.writeFileSync(
    path.join(dir, "src", "index.ts"),
    `#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "${name}",
  version: "1.0.0",
});

server.tool(
  "${toolName}",
  "${toolDescription}",
  {
    input: z.string().describe("Input parameter"),
  },
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
    execSync("npm run build", { cwd: dir, stdio: "pipe", timeout: 30_000 });
    spinner.succeed("Project created");
  } catch {
    spinner.warn("Project created (install may have issues — run npm install manually)");
  }

  console.log(`
${chalk.bold("Next steps:")}

  ${chalk.cyan(`cd ${name}`)}
  ${chalk.cyan("mcpm run .")}              ${chalk.dim("test your server")}
  ${chalk.cyan("code src/index.ts")}       ${chalk.dim("add your tools")}
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

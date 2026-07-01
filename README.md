# mcpm — Universal MCP Server Manager

[![npm](https://img.shields.io/npm/v/mcp-fleet?style=flat-square&color=7c6aff&label=npm)](https://www.npmjs.com/package/mcp-fleet)
[![stars](https://img.shields.io/github/stars/AZERDSQ131/mcpm?style=flat-square&color=facc15)](https://github.com/AZERDSQ131/mcpm/stargazers)
[![license](https://img.shields.io/github/license/AZERDSQ131/mcpm?style=flat-square&color=4ade80)](LICENSE)

**Install, configure, and update MCP servers across all your AI clients in one command.**

```bash
npx mcp-fleet install github
```

<p align="center">
  <img src="https://raw.githubusercontent.com/AZERDSQ131/mcpm/main/assets/demo-install.gif" alt="mcpm install demo" width="700">
</p>

---

## What is mcpm?

mcpm is a CLI that manages [Model Context Protocol](https://modelcontextprotocol.io) servers — the tools that give AI assistants like Claude, Cursor, or Windsurf access to your files, APIs, databases, and more.

Instead of editing JSON config files by hand for each client, mcpm handles everything: it detects your installed AI clients, writes the right config format for each one, and keeps your servers up to date.

---

## Quick start

```bash
# Install a server into all detected AI clients
npx mcp-fleet install github

# Search the registry (1000+ servers)
npx mcp-fleet search database

# Install a curated bundle
npx mcp-fleet install @bundle/webdev

# Check what's installed and healthy
npx mcp-fleet doctor
```

Or install globally:

```bash
npm install -g mcp-fleet
mcpm install github
```

---

## Supported clients

| Client | Config written automatically |
|--------|------------------------------|
| Claude Code | `~/.claude.json` |
| Cursor | `~/.cursor/mcp.json` |
| VS Code Copilot | `~/.vscode/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Zed | `~/.config/zed/settings.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| Cline | VS Code extension storage |
| Continue | `~/.continue/config.json` |
| OpenAI Codex | `~/.codex/config.json` |

---

## Supported runtimes

| Runtime | Command | Example |
|---------|---------|---------|
| Node.js | `npx` | `npx -y @modelcontextprotocol/server-github` |
| Python | `uvx` | `uvx mcp-server-fetch` |
| Docker | `docker run` | `docker run -i --rm mcp/puppeteer` |
| Go | `go run` | `go run github.com/org/server@latest` |
| Deno | `deno run` | `deno run --allow-net jsr:@scope/server` |

---

## Commands

```
mcpm install <server|@bundle/name>   Install one or more servers
mcpm uninstall <server>              Remove a server from all clients
mcpm update                          Update all installed servers
mcpm search [query]                  Browse the registry
mcpm info <server>                   Show server details
mcpm list                            List installed servers
mcpm outdated                        Check for outdated packages
mcpm doctor                          Diagnose broken servers
mcpm sync                            Sync from .mcpmrc project file
mcpm export [file]                   Export your config
mcpm import <file>                   Import a config
mcpm publish                         Submit a server to the registry
mcpm run <server>                    Run a server directly (stdio)
```

<p align="center">
  <img src="https://raw.githubusercontent.com/AZERDSQ131/mcpm/main/assets/demo-doctor.gif" alt="mcpm doctor demo" width="700">
</p>

---

## Project config (.mcpmrc)

Pin your project's MCP servers in a `.mcpmrc` file and let teammates sync in one command:

```json
{
  "servers": ["github", "postgres", "filesystem"],
  "bundles": ["@bundle/webdev"]
}
```

```bash
mcpm sync
mcpm sync --dry-run --receipt .mcpm/sync-receipt.json
```

For team review flows, see [rendered output drift receipts](docs/rendered-output-drift-receipts.md):
a safe dry-run artifact for checking which client config files would change before write/rollback.

<p align="center">
  <img src="https://raw.githubusercontent.com/AZERDSQ131/mcpm/main/assets/demo-sync.gif" alt="mcpm sync demo" width="700">
</p>

---

## Registry

The registry contains **1000+ verified MCP servers** across 5 runtimes.

Browse at [azerdsq131.github.io/mcpm](https://azerdsq131.github.io/mcpm) or search with:

```bash
mcpm search <query>
mcpm search --bundles
```

<p align="center">
  <img src="https://raw.githubusercontent.com/AZERDSQ131/mcpm/main/assets/demo-search.gif" alt="mcpm search demo" width="700">
</p>

### Bundles

| Bundle | Description |
|--------|-------------|
| `@bundle/webdev` | Web development tools |
| `@bundle/ai` | AI & LLM integrations |
| `@bundle/data` | Data & databases |
| `@bundle/devops` | DevOps & infrastructure |
| `@bundle/productivity` | Productivity & scheduling |
| `@bundle/cloud` | Cloud provider APIs |
| `@bundle/finance` | Finance & trading |
| `@bundle/social` | Social media & comms |
| `@bundle/media` | Media & content |
| `@bundle/startup` | Startup essentials |
| `@bundle/ai-tools` | AI tooling & agents |

---

## Submit a server

```bash
mcpm publish
```

The CLI will guide you through the details and open a pull request automatically.

---

## License

MIT

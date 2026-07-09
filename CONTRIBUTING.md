# Contributing to mcpm

Thanks for wanting to add to the registry. The fastest way to contribute is to submit a new MCP server — it takes about 5 minutes.

If you're here to work on the CLI itself rather than the registry, see
[Contributing code](#contributing-code) below.

---

## Adding a server to the registry

### Option A — via the CLI (recommended)

```bash
npx mcp-fleet publish
```

The CLI guides you through the details and opens a pull request automatically.

### Option B — manual PR

1. Fork this repo
2. Edit `packages/registry/registry.json`
3. Add your entry under `servers` (see format below)
4. Open a PR with title `Add <name> to registry`

---

## Registry entry format

```jsonc
"your-server-id": {
  "name": "Display Name",
  "description": "One sentence. What does it do?",
  "command": "npx",
  "args": ["-y", "your-npm-package"],
  "env": {
    "API_KEY": {
      "description": "Your API key",
      "required": true
    }
  },
  "tags": ["tag1", "tag2"]
}
```

### Runtimes

| Runtime | `command` | `args` |
|---------|-----------|--------|
| Node.js | `npx` | `["-y", "package-name"]` |
| Python | `uvx` | `["package-name"]` |
| Docker | `docker` | `["run", "-i", "--rm", "image-name"]` |
| Go | `go` | `["run", "github.com/org/repo@latest"]` |
| Deno | `deno` | `["run", "--allow-net", "--allow-env", "url"]` |

### ID rules

- Lowercase, numbers, hyphens only: `my-server`
- If there's a name conflict, prefix with org: `org-server`
- Keep it short — this is what users type in `mcpm install <id>`

---

## What gets accepted

**Yes:**
- Publicly available package (npm, PyPI, Docker Hub, Go proxy)
- Implements the MCP stdio protocol
- Has a clear, specific description
- `required: true` env vars are documented

**No:**
- SDKs, frameworks, or example repos (not actual servers)
- Packages that don't exist yet on their registry
- Duplicate of an existing entry
- Vague descriptions ("MCP server for things")

The CI will automatically verify that the package exists on its registry before merging.

---

## Adding a bundle

Bundles are curated sets of servers for a specific use case. To propose one, open an issue with:

- Bundle name and description
- List of server IDs it should include
- Why these servers belong together

---

## Questions

Open an issue or start a discussion. PRs are welcome.

---

## Contributing code

This is an npm-workspaces monorepo with a single published package, the `mcpm` CLI.

```
packages/
  cli/          the mcpm CLI (published as mcp-fleet on npm)
    src/
      commands/   one file per subcommand (install.ts, doctor.ts, ...)
      clients/    per-AI-client config detection/read/write
  registry/       registry.json — the source of truth for known MCP servers
```

### Setup

```bash
npm install
npm run build --workspaces
```

Run the CLI locally without installing it globally:

```bash
cd packages/cli
npm run dev -- <command>       # e.g. npm run dev -- search fetch
```

### Before opening a pull request

From `packages/cli`:

```bash
npm test                 # vitest
npm run lint             # eslint
npx tsc --noEmit
```

All three must pass. If you're touching `src/*.ts`, add or update tests in the matching
`*.test.ts` file — most commands and all `clients/`/shared modules have one.

### Adding a new subcommand

1. Add `packages/cli/src/commands/<name>.ts` exporting a function that does the work.
2. Register it in `packages/cli/src/index.ts` (copy the `program.command(...)` block from an
   existing subcommand).
3. Add it to the `Examples:` help text at the bottom of `index.ts` if it's a common case.
4. Add `<name>.test.ts` next to it.

### Security

`doctor`, `outdated`, and `publish` shell out to `git`/`npm`/`curl`. If you're touching those
files, use `execFileSync(cmd, [args...])` (argument array) rather than building a shell string
with `execSync` — the latter is vulnerable to command injection when any part of the string
comes from the registry or user input.

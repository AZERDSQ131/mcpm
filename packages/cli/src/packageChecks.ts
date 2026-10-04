import { execFileSync } from "child_process";

const SKIP: Record<string, string[]> = {
  npx: ["-y"],
  uvx: ["--from"],
  docker: ["run", "-i", "--rm"],
  go: ["run"],
  deno: ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-all"],
};

/**
 * Extract the package / image / module name from a server command + args,
 * skipping runtime flags (e.g. `run`, `-y`, `--from`).
 */
export function extractPkg(command: string, args: string[]): string {
  const skip = new Set(SKIP[command] ?? []);
  return args.find((a) => !a.startsWith("-") && !skip.has(a)) ?? "";
}

/** Latest published version of an npm package, or null when `npm view` fails. */
export function getNpmLatestVersion(pkg: string): string | null {
  try {
    return execFileSync("npm", ["view", pkg, "version"], {
      stdio: "pipe",
      timeout: 10_000,
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** True when the npm package exists (`npm view <pkg> version` succeeds). */
export function checkNpmView(pkg: string): boolean {
  try {
    execFileSync("npm", ["view", pkg, "version"], { stdio: "pipe", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function pypiUrl(pkg: string): string {
  return `https://pypi.org/pypi/${pkg}/json`;
}

/** Latest release of a PyPI package, or null when it cannot be fetched. */
export function getPyPIVersion(pkg: string): string | null {
  try {
    const out = execFileSync("curl", ["-sf", pypiUrl(pkg)], { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(out.toString()) as { info?: { version?: string } };
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}

/** True when the PyPI package exists. */
export function checkPyPI(pkg: string): boolean {
  return !!getPyPIVersion(pkg);
}

function dockerTagUrl(image: string): string {
  const [repo, tag = "latest"] = image.split(":");
  return repo.includes("/")
    ? `https://hub.docker.com/v2/repositories/${repo}/tags/${tag}/`
    : `https://hub.docker.com/v2/repositories/library/${repo}/tags/${tag}/`;
}

/** True when the Docker Hub tag exists. */
export function checkDockerHub(image: string): boolean {
  try {
    const res = execFileSync("curl", ["-sf", dockerTagUrl(image)], { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(res.toString()) as { name?: string };
    return !!data.name;
  } catch {
    return false;
  }
}

/**
 * The requested tag of a Docker image when it exists on Docker Hub (defaults
 * to `latest`), or null otherwise. Matches the `outdated` display logic.
 */
export function getDockerTag(image: string): string | null {
  const [, tag = "latest"] = image.split(":");
  try {
    const out = execFileSync("curl", ["-sf", dockerTagUrl(image)], { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(out.toString()) as { last_updated?: string; name?: string };
    return data.last_updated ? tag : null;
  } catch {
    return null;
  }
}

function stripGoVersion(mod: string): string {
  return mod.replace(/@[^@]+$/, "");
}

function goProxyUrl(mod: string): string {
  return `https://proxy.golang.org/${stripGoVersion(mod)}/@latest`;
}

/** Latest version of a Go module, or null when it cannot be fetched. */
export function getGoModuleVersion(mod: string): string | null {
  try {
    const out = execFileSync("curl", ["-sf", goProxyUrl(mod)], { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(out.toString()) as { Version?: string };
    return data.Version ?? null;
  } catch {
    return null;
  }
}

/** True when the Go module exists on the Go module proxy. */
export function checkGoModule(mod: string): boolean {
  return !!getGoModuleVersion(mod);
}

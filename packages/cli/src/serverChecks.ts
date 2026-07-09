import { execSync } from "child_process";

/**
 * Shared package-lookup helpers used by both `mcpm doctor` (health check) and
 * `mcpm outdated` (version check) — previously duplicated verbatim in both files.
 */

const RUNTIME_SKIP_ARGS: Record<string, string[]> = {
  npx: ["-y"],
  uvx: ["--from"],
  docker: ["run", "-i", "--rm"],
  go: ["run"],
  deno: ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-all"],
};

/** Extracts the package/image/module name from a server's command args, skipping known runtime flags. */
export function extractPkg(command: string, args: string[]): string {
  const skip = new Set(RUNTIME_SKIP_ARGS[command] ?? []);
  return args.find((a) => !a.startsWith("-") && !skip.has(a)) ?? "";
}

export function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function fetchNpmVersion(pkg: string): string | null {
  try {
    return execSync(`npm view ${pkg} version`, { stdio: "pipe", timeout: 10_000 }).toString().trim();
  } catch {
    return null;
  }
}

export function fetchPyPIVersion(pkg: string): string | null {
  try {
    const out = execSync(`curl -sf "https://pypi.org/pypi/${pkg}/json"`, { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(out.toString()) as { info?: { version?: string } };
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}

export function fetchDockerHubTag(image: string): string | null {
  try {
    const [repo, tag = "latest"] = image.split(":");
    const url = repo.includes("/")
      ? `https://hub.docker.com/v2/repositories/${repo}/tags/${tag}/`
      : `https://hub.docker.com/v2/repositories/library/${repo}/tags/${tag}/`;
    const res = execSync(`curl -sf "${url}"`, { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(res.toString()) as { name?: string };
    return data.name ? tag : null;
  } catch {
    return null;
  }
}

export function fetchGoModuleVersion(mod: string): string | null {
  try {
    const res = execSync(`curl -sf "https://proxy.golang.org/${mod}/@latest"`, { stdio: "pipe", timeout: 10_000 });
    const data = JSON.parse(res.toString()) as { Version?: string };
    return data.Version ?? null;
  } catch {
    return null;
  }
}

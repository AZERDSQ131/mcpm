import chalk from "chalk";
import { execFileSync } from "child_process";

interface ChangelogOptions {
  from?: string;
  limit?: number;
}

const GROUPS: Array<{ prefix: string; label: string }> = [
  { prefix: "feat", label: "Features" },
  { prefix: "fix", label: "Fixes" },
  { prefix: "refactor", label: "Refactors" },
  { prefix: "test", label: "Tests" },
  { prefix: "docs", label: "Docs" },
  { prefix: "chore", label: "Chores" },
  { prefix: "ci", label: "CI" },
];

function runGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, { stdio: "pipe", timeout: 10_000 }).toString().trim();
  } catch {
    return null;
  }
}

function latestTag(): string | null {
  return runGit(["describe", "--tags", "--abbrev=0"]);
}

function commitSubjectsSince(ref: string | null): string[] {
  const range = ref ? `${ref}..HEAD` : "HEAD";
  const out = runGit(["log", range, "--no-merges", "--pretty=format:%s"]);
  if (!out) return [];
  return out.split("\n").filter((line) => line.trim().length > 0);
}

function groupCommits(subjects: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const other: string[] = [];

  for (const subject of subjects) {
    const match = subject.match(/^(\w+)(\([^)]*\))?:\s*(.+)$/);
    const prefix = match?.[1]?.toLowerCase();
    const known = GROUPS.find((g) => g.prefix === prefix);

    if (known) {
      const list = groups.get(known.label) ?? [];
      list.push(match![3]);
      groups.set(known.label, list);
    } else {
      other.push(subject);
    }
  }

  if (other.length > 0) groups.set("Other", other);
  return groups;
}

/** Generates a grouped changelog from conventional-commit-style git log messages since the last tag (or all history). */
export function changelog(opts: ChangelogOptions = {}): void {
  if (!runGit(["rev-parse", "--is-inside-work-tree"])) {
    console.log(chalk.red("\nNot inside a git repository.\n"));
    return;
  }

  const from = opts.from ?? latestTag() ?? undefined;
  const subjects = commitSubjectsSince(from ?? null);

  if (subjects.length === 0) {
    console.log(chalk.dim("\nNo commits found in range.\n"));
    return;
  }

  const grouped = groupCommits(subjects);

  console.log(chalk.bold(`\nChangelog${from ? ` since ${from}` : ""}\n`));

  for (const { label } of [...GROUPS, { prefix: "other", label: "Other" }]) {
    const items = grouped.get(label);
    if (!items || items.length === 0) continue;

    console.log(chalk.bold(label));
    const limited = opts.limit ? items.slice(0, opts.limit) : items;
    for (const item of limited) {
      console.log(`  - ${item}`);
    }
    if (opts.limit && items.length > opts.limit) {
      console.log(chalk.dim(`  ... and ${items.length - opts.limit} more`));
    }
    console.log();
  }
}

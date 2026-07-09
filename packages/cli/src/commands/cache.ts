import chalk from "chalk";
import {
  getCacheStats,
  clearCacheAndStats,
  getCachePath,
  formatDuration,
  formatBytes,
  getHitMissStats,
} from "../cache.js";

export function cacheInfo(): void {
  const stats = getCacheStats();

  console.log();
  console.log(chalk.bold("Registry cache"));
  console.log(chalk.dim("─".repeat(40)));

  if (!stats.exists) {
    console.log(chalk.dim("No cache file yet."));
    console.log(chalk.dim(`Path: ${getCachePath()}`));
    console.log();
    return;
  }

  const ttlSourceLabel =
    stats.ttlSource === "env" ? chalk.cyan("MCPM_CACHE_TTL_MINUTES") : chalk.dim("default");

  console.log(`Path:   ${chalk.dim(stats.path)}`);
  console.log(`Size:   ${formatBytes(stats.sizeBytes)}`);
  console.log(`Age:    ${formatDuration(stats.ageMs)}`);
  console.log(`TTL:    ${formatDuration(stats.ttlMs)} ${chalk.dim(`(${ttlSourceLabel})`)}`);
  console.log(
    `Status: ${stats.isFresh ? chalk.green("fresh") : chalk.yellow("stale (will refetch on next use)")}`
  );

  if (stats.invalidEnvValue) {
    console.log(
      chalk.yellow(
        `\n⚠ MCPM_CACHE_TTL_MINUTES="${stats.invalidEnvValue}" is not a valid positive number — using the default TTL instead.`
      )
    );
  }

  console.log();
  console.log(chalk.dim("Override TTL: ") + chalk.italic("MCPM_CACHE_TTL_MINUTES=30 mcpm search"));
  console.log();
}

export function cacheClear(): void {
  const cleared = clearCacheAndStats();
  if (cleared) {
    console.log(chalk.green("\n✓ Registry cache cleared\n"));
  } else {
    console.log(chalk.yellow("\n~ No cache to clear\n"));
  }
}

export function cacheStatsCommand(): void {
  const { hits, misses, hitRate } = getHitMissStats();
  const total = hits + misses;

  console.log();
  console.log(chalk.bold("Registry cache — hit/miss stats"));
  console.log(chalk.dim("─".repeat(40)));

  if (total === 0) {
    console.log(chalk.dim("No cache reads recorded yet."));
    console.log();
    return;
  }

  console.log(`Hits:    ${chalk.green(hits)}`);
  console.log(`Misses:  ${chalk.yellow(misses)}`);
  console.log(`Hit rate: ${chalk.bold(`${(hitRate * 100).toFixed(1)}%`)} ${chalk.dim(`(${total} reads)`)}`);
  console.log();
}

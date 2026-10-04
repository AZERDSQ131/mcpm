let dryRun = false;

/** Sets the process-wide dry-run flag, set from the global `--dry-run` CLI option. */
export function setDryRun(value: boolean): void {
  dryRun = value;
}

export function isDryRun(): boolean {
  return dryRun;
}

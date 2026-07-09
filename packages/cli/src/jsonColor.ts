import chalk from "chalk";

/**
 * Colorizes pretty-printed JSON for terminal display: keys in cyan, strings in green,
 * numbers/booleans in yellow, null in dim, punctuation left uncolored.
 */
export function colorizeJson(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        return /:$/.test(match) ? chalk.cyan(match) : chalk.green(match);
      }
      if (/true|false/.test(match)) return chalk.yellow(match);
      if (/null/.test(match)) return chalk.dim(match);
      return chalk.yellow(match);
    }
  );
}

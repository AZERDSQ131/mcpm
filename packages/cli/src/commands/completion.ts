import chalk from "chalk";

const COMMANDS = [
  "install", "uninstall", "search", "info", "list",
  "update", "outdated", "doctor", "run", "sync",
  "export", "import", "completion", "help",
];

const BASH_SCRIPT = `
_mcpm_completions() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local commands="${COMMANDS.join(" ")}"
  local servers="$(mcpm search 2>/dev/null | grep -E '^  [a-z]' | awk '{print $1}')"

  case "$prev" in
    install|i|uninstall|remove|rm|info|run)
      COMPREPLY=($(compgen -W "$servers" -- "$cur"))
      return 0
      ;;
    mcpm)
      COMPREPLY=($(compgen -W "$commands" -- "$cur"))
      return 0
      ;;
  esac
}

complete -F _mcpm_completions mcpm
`;

const ZSH_SCRIPT = `
_mcpm() {
  local state

  _arguments \\
    '1: :->command' \\
    '*: :->args'

  case $state in
    command)
      local commands=(${COMMANDS.map((c) => `'${c}'`).join(" ")})
      _describe 'command' commands
      ;;
    args)
      case $words[2] in
        install|i|uninstall|remove|rm|info|run)
          local servers=($(mcpm search 2>/dev/null | grep -E '^  [a-z]' | awk '{print $1}'))
          _describe 'server' servers
          ;;
      esac
      ;;
  esac
}

compdef _mcpm mcpm
`;

const FISH_SCRIPT = `
# mcpm fish completion
set -l commands ${COMMANDS.join(" ")}
set -l server_commands install uninstall info run

complete -c mcpm -f

# Complete commands
complete -c mcpm -n "not __fish_seen_subcommand_from $commands" -a "$commands"

# Complete server names for relevant commands
complete -c mcpm -n "__fish_seen_subcommand_from $server_commands" \\
  -a "(mcpm search 2>/dev/null | grep -E '^  [a-z]' | awk '{print $1}')"
`;

type Shell = "bash" | "zsh" | "fish";

export function completion(shell: Shell): void {
  switch (shell) {
    case "bash":
      process.stdout.write(BASH_SCRIPT.trimStart());
      break;
    case "zsh":
      process.stdout.write(ZSH_SCRIPT.trimStart());
      break;
    case "fish":
      process.stdout.write(FISH_SCRIPT.trimStart());
      break;
    default:
      console.log(chalk.red(`Unknown shell: ${shell}`));
      console.log(chalk.dim("Supported: bash, zsh, fish\n"));
  }
}

export function printCompletionHelp(): void {
  console.log(`
${chalk.bold("Shell completion setup")}

${chalk.dim("bash:")}
  echo 'eval "$(mcpm completion bash)"' >> ~/.bashrc

${chalk.dim("zsh:")}
  echo 'eval "$(mcpm completion zsh)"' >> ~/.zshrc

${chalk.dim("fish:")}
  mcpm completion fish > ~/.config/fish/completions/mcpm.fish

Then restart your shell or run ${chalk.italic("source ~/.zshrc")} (or equivalent).
`);
}

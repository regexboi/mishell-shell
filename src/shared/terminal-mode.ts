const TERMINAL_MODE_COMMANDS = new Set([
  "bash",
  "bottom",
  "btm",
  "btop",
  "claude",
  "cmd",
  "cmd.exe",
  "codex",
  "fish",
  "fzf",
  "gitui",
  "helix",
  "htop",
  "hx",
  "k9s",
  "kak",
  "lf",
  "lazydocker",
  "lazygit",
  "less",
  "man",
  "mc",
  "micro",
  "more",
  "nano",
  "neomutt",
  "nnn",
  "nvim",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "ranger",
  "screen",
  "ssh",
  "tig",
  "tmux",
  "top",
  "vi",
  "vim",
  "watch",
  "yazi",
  "zsh",
]);

const NON_INTERACTIVE_FLAGS = new Set([
  "--help",
  "--version",
  "-h",
  "-v",
  "-V",
]);

const LEADING_COMMAND_WRAPPERS = new Set([
  "builtin",
  "command",
  "exec",
  "nohup",
  "time",
]);

export function shouldUseTerminalMode(commandText: string) {
  const tokens = tokenizeCommand(commandText);

  if (tokens.length === 0) {
    return false;
  }

  const { command, remaining } = extractPrimaryCommand(tokens);

  if (!command || !TERMINAL_MODE_COMMANDS.has(command)) {
    return false;
  }

  return !remaining.some((token) => NON_INTERACTIVE_FLAGS.has(token));
}

export function getPrimaryCommand(commandText: string) {
  return extractPrimaryCommand(tokenizeCommand(commandText)).command;
}

function tokenizeCommand(commandText: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const character of commandText) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = quote === "'" ? false : true;

      if (!escaping) {
        current += character;
      }
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function extractPrimaryCommand(tokens: string[]) {
  let index = 0;

  while (tokens[index] && isEnvAssignment(tokens[index]!)) {
    index += 1;
  }

  while (tokens[index]) {
    const token = tokens[index]!.toLowerCase();

    if (token === "sudo") {
      index += 1;

      while (
        tokens[index] &&
        tokens[index] !== "--" &&
        tokens[index]!.startsWith("-")
      ) {
        index += 1;
      }

      if (tokens[index] === "--") {
        index += 1;
      }

      continue;
    }

    if (token === "env") {
      index += 1;

      while (tokens[index]) {
        if (tokens[index] === "--") {
          index += 1;
          break;
        }

        if (
          tokens[index]!.startsWith("-") ||
          isEnvAssignment(tokens[index]!)
        ) {
          index += 1;
          continue;
        }

        break;
      }

      continue;
    }

    if (LEADING_COMMAND_WRAPPERS.has(token)) {
      index += 1;
      continue;
    }

    const commandToken = tokens[index]!;
    const normalizedCommand = commandToken
      .split(/[\\/]/)
      .pop()
      ?.toLowerCase();

    return {
      command: normalizedCommand ?? null,
      remaining: tokens.slice(index + 1).map((value) => value.toLowerCase()),
    };
  }

  return {
    command: null,
    remaining: [],
  };
}

function isEnvAssignment(token: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(token);
}

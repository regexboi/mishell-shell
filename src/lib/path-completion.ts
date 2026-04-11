export function shouldRequestPathCompletions(draft: string) {
  if (/\s$/.test(draft)) {
    return true;
  }

  const token = draft.match(/(?:^|\s)([^\s]+)$/)?.[1] ?? "";

  if (!token) {
    return false;
  }

  return (
    token.includes("/") ||
    token.includes("\\") ||
    token === "." ||
    token === ".." ||
    token === "~" ||
    token.startsWith("./") ||
    token.startsWith("../") ||
    token.startsWith("~/") ||
    token.startsWith("~\\") ||
    /^[A-Za-z]:$/.test(token) ||
    /^[A-Za-z]:[\\/]/.test(token)
  );
}

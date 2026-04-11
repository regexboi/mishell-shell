import { z } from "zod";

export const ipcChannels = {
  getBootstrap: "app:get-bootstrap",
  runCommand: "app:run-command",
  interruptExecution: "app:interrupt-execution",
  executionEvent: "app:execution-event",
  writeTerminalInput: "terminal:write-input",
  resizeTerminal: "terminal:resize",
  getPathCompletions: "shell:get-path-completions",
  writeClipboard: "app:write-clipboard",
  getHistoryAutocomplete: "history:get-autocomplete",
  searchHistory: "history:search",
  getHistoryRecall: "history:get-recall",
} as const;

export const releaseStageSchema = z.enum([
  "phase-01-foundation",
  "phase-02-execution-ui",
  "phase-03-history-search",
  "phase-04-terminal-mode",
  "phase-05-v1-polish",
]);

export const commandPresentationSchema = z.enum(["card", "terminal"]);

export const shellSurfaceSchema = z.object({
  id: z.enum(["editor", "feed", "history", "terminal"]),
  label: z.string(),
  status: z.enum(["ready", "active", "planned", "standby"]),
  shortcut: z.string().optional(),
  description: z.string(),
});

export const shellContextSchema = z.object({
  executable: z.string(),
  shellName: z.string(),
  cwd: z.string(),
  displayCwd: z.string(),
  gitBranch: z.string().nullable(),
  sessionId: z.string(),
});

export const bootstrapPayloadSchema = z.object({
  appName: z.string(),
  platform: z.string(),
  shell: shellContextSchema,
  database: z.object({
    path: z.string(),
    appliedMigrations: z.array(z.string()),
  }),
  surfaces: z.array(shellSurfaceSchema),
  focusMode: z.object({
    defaultSurface: z.enum(["editor", "feed", "history", "terminal"]),
    keyboardFirst: z.boolean(),
  }),
  release: z.object({
    stage: releaseStageSchema,
    launchedAt: z.string(),
  }),
});

export const runCommandRequestSchema = z.object({
  commandText: z.string().trim().min(1),
});

export const runCommandResponseSchema = z.object({
  executionId: z.string(),
  mode: commandPresentationSchema,
});

export const interruptExecutionRequestSchema = z.object({
  executionId: z.string(),
});

export const terminalInputRequestSchema = z.object({
  executionId: z.string(),
  data: z.string().min(1),
});

export const terminalResizeRequestSchema = z.object({
  executionId: z.string(),
  cols: z.number().int().positive().max(500),
  rows: z.number().int().positive().max(300),
});

export const writeClipboardRequestSchema = z.object({
  text: z.string(),
});

export const historyAutocompleteRequestSchema = z.object({
  draft: z.string(),
  cwd: z.string(),
  limit: z.number().int().positive().max(12).default(6),
});

export const historySearchRequestSchema = z.object({
  query: z.string(),
  cwd: z.string(),
  limit: z.number().int().positive().max(100).default(40),
});

export const historyRecallRequestSchema = z.object({
  cwd: z.string(),
  limit: z.number().int().positive().max(120).default(60),
});

export const pathCompletionRequestSchema = z.object({
  draft: z.string(),
  cwd: z.string(),
  limit: z.number().int().positive().max(60).default(24),
});

export const commandExecutionSchema = z.object({
  id: z.string(),
  presentation: commandPresentationSchema,
  commandText: z.string(),
  cwd: z.string(),
  shell: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["running", "succeeded", "failed"]),
  durationMs: z.number().int().nonnegative().nullable(),
  exitCode: z.number().int().nullable(),
  outputPreview: z.string(),
  output: z.string(),
  outputPath: z.string().nullable(),
});

export const historyEntrySchema = z.object({
  id: z.number().int().positive(),
  commandText: z.string(),
  cwd: z.string(),
  shell: z.string(),
  sessionId: z.string().nullable(),
  startedAt: z.string(),
  durationMs: z.number().int().nonnegative().nullable(),
  exitCode: z.number().int().nullable(),
  outputPreview: z.string(),
  outputPath: z.string().nullable(),
  cwdMatch: z.boolean(),
});

export const historyAutocompleteItemSchema = z.object({
  commandText: z.string(),
  cwd: z.string(),
  lastStartedAt: z.string(),
  usageCount: z.number().int().positive(),
  lastExitCode: z.number().int().nullable(),
  outputPreview: z.string(),
  cwdMatch: z.boolean(),
});

export const historyRecallItemSchema = z.object({
  id: z.number().int().positive(),
  commandText: z.string(),
  startedAt: z.string(),
  durationMs: z.number().int().nonnegative().nullable(),
  exitCode: z.number().int().nullable(),
});

export const pathCompletionItemSchema = z.object({
  nextValue: z.string(),
  label: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
});

export const historyAutocompleteResponseSchema = z.object({
  items: z.array(historyAutocompleteItemSchema),
});

export const historySearchResponseSchema = z.object({
  items: z.array(historyEntrySchema),
});

export const historyRecallResponseSchema = z.object({
  items: z.array(historyRecallItemSchema),
});

export const pathCompletionResponseSchema = z.object({
  items: z.array(pathCompletionItemSchema),
});

export const executionStartedEventSchema = z.object({
  type: z.literal("started"),
  execution: commandExecutionSchema,
});

export const executionOutputEventSchema = z.object({
  type: z.literal("output"),
  executionId: z.string(),
  chunk: z.string(),
  target: commandPresentationSchema,
});

export const executionCompletedEventSchema = z.object({
  type: z.literal("completed"),
  execution: commandExecutionSchema,
  shellContext: shellContextSchema,
});

export const executionEventSchema = z.discriminatedUnion("type", [
  executionStartedEventSchema,
  executionOutputEventSchema,
  executionCompletedEventSchema,
]);

export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;
export type CommandExecution = z.infer<typeof commandExecutionSchema>;
export type ExecutionEvent = z.infer<typeof executionEventSchema>;
export type HistoryAutocompleteItem = z.infer<typeof historyAutocompleteItemSchema>;
export type HistoryAutocompleteRequest = z.infer<
  typeof historyAutocompleteRequestSchema
>;
export type HistoryAutocompleteResponse = z.infer<
  typeof historyAutocompleteResponseSchema
>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type HistoryRecallItem = z.infer<typeof historyRecallItemSchema>;
export type HistoryRecallRequest = z.infer<typeof historyRecallRequestSchema>;
export type HistoryRecallResponse = z.infer<typeof historyRecallResponseSchema>;
export type HistorySearchRequest = z.infer<typeof historySearchRequestSchema>;
export type HistorySearchResponse = z.infer<typeof historySearchResponseSchema>;
export type InterruptExecutionRequest = z.infer<
  typeof interruptExecutionRequestSchema
>;
export type PathCompletionItem = z.infer<typeof pathCompletionItemSchema>;
export type PathCompletionRequest = z.infer<typeof pathCompletionRequestSchema>;
export type PathCompletionResponse = z.infer<typeof pathCompletionResponseSchema>;
export type RunCommandRequest = z.infer<typeof runCommandRequestSchema>;
export type RunCommandResponse = z.infer<typeof runCommandResponseSchema>;
export type ShellContext = z.infer<typeof shellContextSchema>;
export type ShellSurface = z.infer<typeof shellSurfaceSchema>;
export type TerminalInputRequest = z.infer<typeof terminalInputRequestSchema>;
export type TerminalResizeRequest = z.infer<typeof terminalResizeRequestSchema>;
